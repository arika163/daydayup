/**
 * Teleport
 * ----------------------------------------
 * 一种特殊的 VNode 类型（而非普通组件），用于将其子节点
 * 渲染到指定的目标容器（target）中，而不是当前组件的 DOM 层级中。
 *
 * 核心特点：
 * - 不需要 render 函数
 * - 不走组件挂载流程（setup / effect）
 * - 在渲染器层面通过 process 进行特殊处理
 *
 * ----------------------------------------
 * 设计目的：
 * 1. 将“逻辑位置”和“DOM 位置”解耦
 * 2. 支持跨容器渲染（如弹窗、全局挂载节点）
 *
 * ----------------------------------------
 * 为什么用 process 而不是 render：
 * - render 只能描述结构（VNode）
 * - Teleport 需要控制“挂载位置”（container）
 * - 属于 renderer 层能力，而非组件层能力
 *
 * ----------------------------------------
 * process 方法（核心逻辑）
 *
 * @param n1 旧 vnode（null 表示首次挂载）
 * @param n2 新 vnode
 * @param container 当前组件的容器（注意：不一定是最终挂载位置）
 * @param anchor 锚点
 * @param internals 渲染器内部方法（patch / move / patchChildren 等）
 *
 * ----------------------------------------
 * 挂载流程（mount）：
 *
 * 1. 解析目标容器 target（props.to）
 * 2. 将 children 挂载到 target，而不是 container
 *
 * ----------------------------------------
 * 更新流程（update）：
 *
 * 1. 先在“当前容器”中 patchChildren（用于 diff）
 * 2. 如果 target 改变：
 *    - 将所有子节点移动到新的 target
 *
 * ----------------------------------------
 * children 的语义（重点）：
 *
 * 在 Teleport 中：
 * - children = 要被“传送”的内容（VNode 数组）
 * - 不表示组件层级关系
 *
 * ----------------------------------------
 * 与普通组件的区别：
 *
 * teleport 没有自己的 effect\setup\render，所以不存在主动更新
 * teleport 只会随父组件的更新而被动更新
 * 
 * ----------------------------------------
 * 注意事项 / 潜在问题：
 *
 * 1. target 必须存在（否则挂载失败）
 * 2. children 实际不在 container 中，调试 DOM 时要注意
 * 3. 多次 Teleport 到同一 target 时需要锚点管理（源码中有处理）
 *
 */
const Teleport = {
  __isTeleport: true,
  // 在实现 Teleport时，我们将 Teleport 组件的渲染逻辑
  // 从渲染器中分离出来，这么做有两点好处：
  //   - 可以避免渲染器逻辑代码“膨胀”
  //   - 可以利用 Tree-Shaking 机制在最终的bundle中删除 Teleport 相关代码（如果未使用）
  process(n1, n2, container, anchor, internals) {
    // 通过 internals 参数取得渲染器的内部方法
    const { patch, patchChildren, move } = internals
    // 如果旧 VNode n1 不存在，则是全新的挂载，否则执行更新
    if(!n1) {
      // 挂载
      // 获取容器，即挂载点
      const target = typeof n2.props.to === 'string'
        ? document.querySelector(n2.props.to)
        : n2.props.to
      // 将 n2.children 渲染到指定挂载点即可
      n2.children.forEach(c => patch(null, c, target, anchor))
    } else {
      // 更新
      patchChildren(n1, n2, container)
      // 如果新旧 to 参数的值不同，则需要对内容进行移动
      if(n2.props.to !== n1.props.to) {
        // 获取新的容器
        const newTarget = typeof n2.props.to === 'string' 
          ? document.querySelector(n2.props.to)
          : n2.props.to
        // 移动到新容器
        n2.children.forEach(c => move(c, newTarget))
      }
    }
  }
  // 与其说 Teleport 是一个内部组件，Teleport更像
  // 是一种VNode类型，这种类型的 VNode 在渲染的时候
  // 会被渲染器直接特殊处理，所以并不需要render方法
}

// 父组件 render 函数示例：
function render() {
  return {
    type: Teleport,
    // 以普通 children 的形式代表被 Teleport 的内容
    children: [
      { type: 'h1', children: 'Title' },
      { type: 'p', children: 'content' }
    ]
  }
}