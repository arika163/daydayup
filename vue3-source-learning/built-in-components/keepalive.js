/**
 * KeepAlive
 * ----------------------------------------
 * 一个内置的抽象组件，用于缓存其包裹的动态组件实例，
 * 避免组件在切换时被卸载（unmount），从而保留状态。
 *
 * ----------------------------------------
 * 核心能力：
 * 1. 缓存组件实例（component instance）
 * 2. 隐藏和恢复展示（组件的 DOM）
 * 3. 激活（activate）时，展示组件 DOM（从隐藏容器中移出）
 * 4. 失活（deactivate）时，隐藏组件 DOM（移入隐藏容器）
 *
 * ----------------------------------------
 * props：
 * @property {RegExp} include  仅缓存匹配的组件
 * @property {RegExp} exclude  排除缓存的组件
 *
 * ----------------------------------------
 * 组件实例的缓存：
 *
 * cache: Map（key -> value）
 *   key   -> vnode.type（组件类型）
 *   value -> vnode（包含 component 实例）
 * 
 * 每次 render 新组件的时候，只要符合缓存规则，就加入缓存
 * 
 * 实际上 Vue 还会配合 keys + Set 实现 LRU，创建新缓存时
 * 淘汰太久未使用的缓存
 *
 * ----------------------------------------
 * 隐藏容器：
 *
 * const storageContainer = createElement('div')
 *
 * 用于存放“失活组件”的 DOM
 * （组件未卸载，只是被移动）
 *
 * ----------------------------------------
 * 生命周期控制（关键）：
 *
 * instance._deActivate(vnode)
 *   → 劫持渲染器的正常卸载行为，改为将组件 DOM 移入隐藏容器
 *
 * instance._activate(vnode, container, anchor)
 *   → 劫持渲染器的正常挂载行为，改为将组件 DOM 从隐藏容器中取出
 *
 * ----------------------------------------
 * 渲染流程（render）：
 *
 * 1. 获取默认插槽 vnode
 *    const rawVNode = slots.default()
 *
 * 2. 非组件直接返回（无法缓存）
 *
 * 3. 根据 name + include/exclude 判断是否需要缓存
 *
 * 4. 查找缓存：
 *
 *    const cachedVNode = cache.get(rawVNode.type)
 *
 *    - 命中：
 *        rawVNode.component = cachedVNode.component
 *        rawVNode.keptAlive = true
 *
 *    - 未命中：
 *        cache.set(type, vnode) // 即 加入缓存
 *
 * 5. 标记 vnode：
 *
 *    rawVNode.shouldKeepAlive = true
 *    rawVNode.keepAliveInstance = instance
 *
 *    → 告诉 renderer：
 *      - 不要卸载
 *      - 使用 activate/deactivate
 *
 * 6. 返回 vnode
 *
 * ----------------------------------------
 * 关键 vnode 标记：
 *
 * shouldKeepAlive:
 *   → 防止 renderer 卸载组件（走 deactivate）
 *
 * keptAlive:
 *   → 表示组件来自缓存（走 activate）
 *
 * keepAliveInstance:
 *   → 让 renderer 能调用 activate/deactivate
 *
 * ----------------------------------------
 * 注意事项：
 *
 * 1. 只能缓存“组件 vnode”，不能缓存普通元素
 * 2. include / exclude 依赖组件 name（需显式声明）
 * 3. 多个 KeepAlive 之间缓存互不共享
 *
 */
const KeepAlive = {
  // KeepAlive 组件独有的属性，用作标识
  __isKeepAlive: true,
  // 定义 include 和 exclude
  props: {
    include: RegExp,
    exclude: RegExp
  },
  setup(props, { slots }) {
    // 创建一个缓存对象
    // key: vnode.type
    // value: vnode
    const cache = new Map() 
    
    // 省略：最近最常访问缓存淘汰机制（LRU队列）
    
    // 当前KeepAlive组件的实例，参考 mountComponent
    const instance = currentInstance
    // 对于 KeepAlive 组件来说，他的实例上存在特殊的 keepAliveCtx 对象，该对象由渲染器注入
    // 该对象会暴露渲染器的一些内部方法，其中 move 函数用来将一段 DOM 移动到另一个容器中
    // 注入该ctx的相关代码参考渲染器中的 mountComponent 函数
    const { move, createElement } = instance.keepAliveCtx

    // 创建隐藏容器
    // 失活组件的 DOM 会被挂到这里
    const storageContainer = createElement('div')

    // KeepAlive 组件的实例上会被添加两个内部函数，分别是 _deActivate 和 _activate
    // 这两个函数会在渲染器中被调用
    instance._deActivate = (vnode) => { // 参考渲染器 unmount 函数，卸载时，将DOM移动到隐藏容器内
      move(vnode, storageContainer)
    }
    instance._activate = (vnode, container, anchor) => { // 参考渲染器 patch 函数，挂载时，将DOM从隐藏容器中取出
      move(vnode, container, anchor)
    }

    // render，包裹在副作用函数内执行，依赖的响应式变量改变时，重复执行
    return () => {
      // KeepAlive 的默认插槽就是要被 KeepAlive 的组件
      let rawVNode = slots.default()

      // 如果不是组件，直接渲染即可，因为非组件的虚拟节点无法被 KeepAlive
      if (typeof rawVNode.type !== 'object') {
        return rawVNode
      }

      // 获取“内部组件”的 name
      const name = rawVNode.type.name
      // 对 name 进行匹配
      if (
        name &&
        (
          // 如果 name 无法被 include 匹配
          (props.include && !props.include.test(name)) ||
          // 或者被 exclude 匹配
          (props.exclude && props.exclude.test(name))
        )
      ) {
        // 则直接渲染“内部组件”，不对其进行后续的缓存操作
        return rawVNode
      }

      // 在挂载时先获取缓存的组件 vnode
      const cachedVNode = cache.get(rawVNode.type)
      if (cachedVNode) {
        // 如果有缓存的内容，则说明不应该执行挂载，而应该执行激活
        // 继承组件实例
        rawVNode.component = cachedVNode.component
        // 在 vnode 上添加 keptAlive 属性，标记为 true ，避免渲染器重新挂载它
        // 渲染器 patch 函数中发现该属性，会调用 _activate 方法
        rawVNode.keptAlive = true
      } else {
        // 如果没有缓存，则将其添加到缓存中，这样下次激活组件是就不会执行新的挂载动作了
        cache.set(rawVNode.type, rawVNode)
      }

      // 在组件 vnode 上添加 shouldKeepAlive 属性，并标记为true，避免渲染器真的将组件卸载
      // 渲染器的umount方法中发现该属性，不会执行卸载，会转而执行 _deActivate 方法
      rawVNode.shouldKeepAlive = true
      // 将 keepAlive 组件的实例也添加到 vnode 上，以便在渲染器中访问
      rawVNode.keepAliveInstance = instance

      // 渲染组件 vnode
      return rawVNode
    }
  }
}