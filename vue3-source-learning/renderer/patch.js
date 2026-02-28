/**
 * 对比并更新新旧虚拟节点（VNode），并将变更应用到真实 DOM。
 * 这是 Vue3 渲染器的核心入口函数，负责根据 vnode 类型分发处理逻辑。
 *
 * 整体流程：
 * 1. 若新旧 vnode 类型不同，则卸载旧节点并重新挂载新节点
 * 2. 根据 vnode.type 的不同类型，分别处理：
 *    - string：普通 DOM 元素
 *    - Text：文本节点
 *    - Fragment：片段节点（多子节点）
 *    - Teleport：传送组件（跨容器渲染）
 *    - object / function：组件（有状态或函数式组件）
 *
 * @param {VNode|null} n1 - 旧的虚拟节点（old vnode）
 *   - 初次渲染时为 null
 *   - 更新时为上一次渲染生成的 vnode
 *
 * @param {VNode} n2 - 新的虚拟节点（new vnode）
 *   - 描述本次要渲染的 UI 结构
 *
 * @param {HTMLElement} container - 挂载容器（真实 DOM 节点）
 *   - 新节点最终会被插入到该容器中
 *
 * @param {Node|null} [anchor=null] - 锚点元素（可选）
 *   - 用于控制插入位置（insertBefore）
 *   - 如果为 null，则等价于 append 到容器末尾
 *
 * @returns {void}
 */
function patch(n1, n2, container, anchor) {
  // 如果n1存在，则对比n1和n2的类型
  if (n1 && n1.type !== n2.type) {
    // 如果新旧vnode的类型不同，则直接将旧vnode卸载
    unmount(n1)
    n1 = null
  }
  const { type } = n2
  // 如果 n2.type 的值是字符串类型，则描述的是普通标签元素
  if (typeof type === 'string') {
    // 如果n1不存在，意味着挂载，则调用mountElement函数完成挂载
    if (!n1) {
      // 挂载时将锚点元素作为第三个参数传递给mountElement
      mountElement(n2, container, anchor)
    } else {
      // n1 存在，意味着打补丁
      patchElement(n1, n2)
    }
  } else if (type === Text) {
    // 如果新 vnode 的类型是 Text，则说明该 vnode 描述的是文本节点
    // 如果没有旧节点，则进行挂载
    if (!n1) {
      // 使用 createText 函数创建文本节点
      const el = (n2.el = createText(n2.children))
      // 将文本节点插入到容器中
      insert(el, container)
    } else {
      // 如果旧 vnode 存在，只需要使用新文本节点的文本内容更新旧文本节点即可
      const el = (n2.el = n1.el)
      if (n2.children !== n1.children) {
        // 调用 setText 函数更新文本节点的内容
        setText(el, n2.children)
      }
    }
  } else if (type === Fragment) {
    // 处理 Fragment 类型的vnode
    if (!n1) {
      // 如果旧vnode不存在，则只需要将Fragment的children逐个挂载即可
      n2.children.forEach((c) => patch(null, c, container))
    } else {
      // 如果旧vnode存在，则只需要更新Fragment的children即可
      patchChildren(n1, n2, container)
    }
  } else if (typeof type === 'object' && type.__isTeleport) { // teleport组件的渲染器支持
    // 组件选项中如果存在 __isTeleport 标识，则它是 Teleport 组件
    // 调用 Teleport 组件选项中的 process 函数将控制权交接出去
    // 传递给 process 函数的第五个参数是渲染器的一些内部方法

    // 将逻辑转移至 Teleport 组件中，目的是为了避免渲染器的代码继续膨胀
    // 以及更好的摇树优化支持

    type.process(n1, n2, container, anchor, {
      patch,
      patchChildren,
      unmount,
      move(vnode, container, anchor) {
        insert(
          vnode.component ? vnode.component.subTree.el : vnode.el,
          container,
          anchor
        )
      }
    })
  } else if (
    // type 是对象 ---> 有状态组件
    // type 是函数 ---> 函数式组件
    typeof type === 'object' ||
    typeof type === 'function'
  ) {
    // vnode.type 的值是选项对象，作为组件来处理
    if (!n1) {
      // 如果该组件已经被 KeepAlive，则不会重新挂载它，而是会调用 _activate 来激活它
      if (n2.keptAlive) { // KeepAlive 组件的渲染器支持 --> 挂载转激活
        n2.keepAliveInstance._activate(n2, container, anchor)
      } else {
        // 挂载组件
        mountComponent(n2, container, anchor) // 具体实现见组件相关内容的独立文件
      }
    } else {
      // 更新组件
      patchComponent(n1, n2, anchor) // 具体实现见组件相关内容的独立文件
    }
  }
}

/**
 * 卸载 vnode，对应从 DOM 中移除节点或执行组件卸载逻辑。
 *
 * 核心职责：
 * 1. 处理 Fragment（递归卸载子节点）
 * 2. 处理组件（移除subTree）
 * 3. 处理keepalive（转移至缓存）
 * 4. 处理普通 DOM 元素（直接移除）
 * 
 * @param {VNode} vnode - 要卸载的虚拟节点
 * @returns {void}
 */
function unmount(vnode) {
  // 在卸载时，如果卸载的vnode类型为Fragment，则需要卸载其children
  if (vnode.type === Fragment) {
    vnode.children.forEach((c) => unmount(c))
    return
  } else if (typeof vnode.type === 'object') {
    // vnode.shouldKeepAlive 是一个布尔值，用来标识该组件是否应该被keepAlive
    if (vnode.shouldKeepAlive) { // KeepAlive 组件的渲染器支持 --> 卸载转缓存
      // 对于需要被KeepAlive的组件，我们不应该真的卸载它，而应该调用该组件的父组件，
      // 即 KeepAlive 组件的 _deActivate 函数使其失活
      vnode.keepAliveInstance._deActivate(vnode)
    } else {
      // 卸载常规组件vnode
      unmount(vnode.component.subTree)
    }
    return
  }

  // 获取el的父元素
  const parent = vnode.el.parentNode
  // 调用removeChild移除元素
  if (parent) {
    parent.removeChild(vnode.el)
  }
}

/**
 * 挂载普通 DOM 元素 vnode
 *
 * 核心职责：
 * 1. 创建真实 DOM（el）
 * 2. 处理 children（文本 or 数组）
 * 3. 处理 props
 * 4. 插入到容器（支持使用锚点）
 *
 * @param {VNode} vnode - 要挂载的 vnode（type 为字符串）
 * @param {HTMLElement} container - 父容器
 * @param {Node|null} [anchor=null] - 插入参考节点（insertBefore）
 *
 * @returns {void}
 */
function mountElement(vnode, container, anchor) {
  // 创建 DOM 元素
  // 让 vnode.el 引用真实DOM元素
  const el = (vnode.el = createElement(vnode.type))
  // 处理子节点，如果子节点是字符串，代表元素具有文本节点
  if (typeof vnode.children === 'string') {
    // 因此只需要设置元素的 textContent 属性即可
    setElementText(el, vnode.children)
  } else if (Array.isArray(vnode.children)) {
    // 如果 children 是数组，则遍历每一个子节点，并调用patch函数挂载它们
    vnode.children.forEach((child) => {
      patch(null, child, el)
    })
  }

  // 如果 vnode.props 存在才处理它
  // 将 props 应用到 dom 元素上
  // 普通dom元素的 prop 举例：id、class、style 等等，有些需要特殊处理
  if (vnode.props) {
    // 遍历 vnode.props
    for (const key in vnode.props) {
      // 调用 patchProps 函数即可
      patchProps(el, key, null, vnode.props[key]) // 渲染器选项之一，支持跨平台，具体实现参考渲染器文件
    }
  }

  // 将元素添加到容器中
  insert(el, container, anchor)
}

/**
 * 更新已有 DOM 元素，对比新旧 vnode 并打补丁。
 * 进入这个函数，节点类型一定是一样（同一种dom元素）
 *
 * 核心职责：
 * 1. 更新 props
 * 2. 更新 children
 *
 * @param {VNode} n1 - 旧 vnode
 * @param {VNode} n2 - 新 vnode
 *
 * @returns {void}
 */
function patchElement(n1, n2) {
  const el = (n2.el = n1.el)
  const oldProps = n1.props
  const newProps = n2.props
  // 第一步：更新 props
  for (const key in newProps) {
    if (newProps[key] !== oldProps[key]) {
      patchProps(el, key, oldProps[key], newProps[key]) // 渲染器选项之一，支持跨平台，具体实现参考渲染器文件
    }
  }
  for (const key in oldProps) { // 移除更新后不该存在的props
    if (!(key in newProps)) {
      patchProps(el, key, oldProps[key], null)
    }
  }

  // 第二步：更新children
  patchChildren(n1, n2, el)
}

/**
 * 对比并更新子节点，是 diff 的入口
 * patchKeyedChildren 是 Vue3 diff 的核心实现
 *
 * @param {VNode} n1 - 旧 vnode
 * @param {VNode} n2 - 新 vnode
 * @param {HTMLElement} container - 父 DOM 容器
 *
 * @returns {void}
 */
function patchChildren(n1, n2, container) {
  // 判断新子节点的类型是否是文本节点
  if (typeof n2.children === 'string') {
    // 旧子节点的类型有三种可能：没有子节点、文本子节点以及一组子节点
    // 只有当旧子节点为一组子节点时，才需要逐个卸载，其他情况下什么都不需要做
    if (Array.isArray(n1.children)) {
      n1.children.forEach((c) => unmount(c))
    }
    // 最后将新的文本节点内容设置给容器元素
    setElementText(container, n2.children)
  } else if (Array.isArray(n2.children)) {
    // 说明新子节点是一组子节点

    // 判断旧子节点是否也是一组子节点
    if (Array.isArray(n1.children)) {
      // 封装 patchKeyedChildren 函数处理两组子节点
      patchKeyedChildren(n1, n2, container) // vue3 使用quick diff算法，具体实现见另一文件
    } else {
      // 此时：
      // 旧子节点要么是文本子节点，要么不存在
      // 但无论哪种情况，我们都只需要讲容器清空，然后将新的一组子节点逐个挂载
      setElementText(container, '')
      n2.children.forEach((c) => patch(null, c, container))
    }
  } else {
    // 代码运行到这里，说明新子节点不存在
    // 旧子节点是一组子节点，只需逐个卸载即可
    if (Array.isArray(n1.children)) {
      n1.children.forEach((c) => unmount(c))
    } else if (typeof n1.children === 'string') {
      // 旧子节点是文本子节点，清空内容即可
      setElementText(container, '')
    }
    // 如果也没有旧子节点，那么什么都不需要做
  }
}