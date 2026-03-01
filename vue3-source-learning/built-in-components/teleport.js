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
}

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