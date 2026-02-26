const Text = Symbol()
const Comment = Symbol()
const Fragment = Symbol()


// 在创建 renderer 时传入配置项
function createRenderer(options) {

  // 通过options得到操作DOM的API
  const {
    createElement,
    insert,
    createText,
    setText,
    setElementText
  } = options

  function render(vnode, container) {
    if (vnode) {
      patch(container._vnode, vnode, container)
    } else {
      if (container._vnode) {
        // 旧vnode存在，且新vnode不存在，说明是卸载操作
        // 调用unmount函数卸载vnode
        unmount(container._vnode)
      }
    }
    container._vnode = vnode
  }

  // patch 函数需要接收第四个参数，即锚点元素
  function patch(n1, n2, container, anchor) {
    // 如果n1存在，则对比n1和n2的类型
    if(n1 && n1.type !== n2.type) {
      // 如果新旧vnode的类型不同，则直接将旧vnode卸载
      unmount(n1)
      n1 = null
    }
    const { type } = n2
    // 如果 n2.type 的值是字符串类型，则描述的是普通标签元素
    if (typeof type === 'string') {
      // 如果n1不存在，意味着挂载，则调用mountElement函数完成挂载
      if(!n1) {
        // 挂载时将锚点元素作为第三个参数传递给mountElement
        mountElement(n2, container, anchor)
      } else {
        // n1 存在，意味着打补丁，暂时省略
        patchElement(n1, n2)
      } 
    } else if (type === Text) { // 如果新vnode的类型是Text，则说明该vnode描述的是文本节点
      // 如果没有旧节点，则进行挂载
      if(!n1) {
        // 使用createText 函数创建文本节点
        const el = n2.el = createText(n2.children)
        // 将文本节点插入到容器中
        insert(el, container)
      } else {
        // 如果旧vnode存在，只需要使用新文本节点的文本内容更新旧文本节点即可
        const el = n2.el = n1.el
        if (n2.children !== n1.children) {
          // 调用 setText 函数更新文本节点的内容
          setText(el, n2.children)
        }
      }
    } else if (type === Fragment) { // 处理 Fragment 类型的vnode
      if (!n1) {
        // 如果旧vnode不存在，则只需要将Fragment的children逐个挂载即可
        n2.children.forEach(c => patch(null, c, container))
      } else {
        // 如果旧vnode存在，则只需要更新Fragment的children即可
        patchChildren(n1, n2, container)
      }
    } else if (typeof type === 'object') {
      // vnode.type 的值是选项对象，作为组件来处理
      if (!n1) {
        // 挂载组件
        mountComponent(n2, container, anchor)
      } else {
        // 更新组件
        patchComponent(n1, n2, anchor)
      }
    }
  }
  
  function unmount(vnode) {
    // 在卸载时，如果卸载的vnode类型为Fragment，则需要卸载其children
    if(vnode.type === Fragment) {
      vnode.children.forEach(c => unmount(c))
    }

    // 获取el的父元素
    const parent = vnode.el.parentNode
    // 调用removeChild移除元素
    if(parent) {
      parent.removeChild(vnode.el)
    }
  }

  function mountElement(vnode, container, anchor) {
    // 创建 DOM 元素
    // 让vnode.el 引用真实DOM元素
    const el = vnode.el = createElement(vnode.type)
    // 处理子节点，如果子节点是字符串，代表元素具有文本节点
    if(typeof vnode.children === 'string') {
      // 因此只需要设置元素的 textContent 属性即可
      setElementText(el, vnode.children)
    } else if (Array.isArray(vnode.children)) {
      // 如果 children 是数组，则遍历每一个子节点，并调用patch函数挂载它们
      vnode.children.forEach(child => {
        patch(null, child, el)
      })
    }

    // 如果 vnode.props 存在才处理它
    if (vnode.props) {
      // 遍历 vnode.props
      for (const key in vnode.props) {
        // 调用patchProps函数即可
        patchProps(el, key, null, vnode.props[key])
      }
    }

    // 将元素添加到容器中
    insert(el, container, anchor)
  }

  function patchElement(n1, n2) {
    const el = n2.el = n1.el
    const oldProps = n1.props
    const newProps = n2.props
    // 第一步：更新 props
    for (const key in newProps) {
      if (newProps[key] !==  oldProps[key]) {
        patchProps(el, key, oldProps[key], newProps[key])
      }
    }
    for (const key in oldProps) {
      if(!(key in newProps)) {
        patchProps(el, key, oldProps[key], null)
      }
    }

    // 第二步：更新children
    patchChildren(n1, n2, el)
  }

  function patchChildren(n1, n2, container) {
    // 判断新子节点的类型是否是文本节点
    if (typeof n2.children === 'string') {
      // 旧子节点的类型有三种可能：没有子节点、文本子节点以及一组子节点
      // 只有当旧子节点为一组子节点时，才需要逐个卸载，其他情况下什么都不需要做
      if(Array.isArray(n1.children)) {
        n1.children.forEach((c) => unmount(c))
      }
      // 最后将新的文本节点内容设置给容器元素
      setElementText(container, n2.children)
    } else if (Array.isArray(n2.children)) {
      // 说明新子节点是一组子节点

      // 判断旧子节点是否也是一组子节点
      if(Array.isArray(n1.children)) {
        // 封装 patchKeyedChildren 函数处理两组子节点
        patchKeyedChildren(n1, n2, container)
      } else {
        // 此时：
        // 旧子节点要么是文本子节点，要么不存在
        // 但无论哪种情况，我们都只需要讲容器清空，然后将新的一组子节点逐个挂载
        setElementText(container, '')
        n2.children.forEach(c => patch(null, c, container))
      }
    } else {
      // 代码运行到这里，说明新子节点不存在
      // 旧子节点是一组子节点，只需逐个卸载即可
      if(Array.isArray(n1.children)) {
        n1.children.forEach(c => unmount(c))
      } else if (typeof n1.children === 'string') {
        // 旧子节点是文本子节点，清空内容即可
        setElementText(container, '')
      }
      // 如果也没有旧子节点，那么什么都不需要做
    }
  }

  return {
    render
  }
}

function shouldSetAsProps(el, key, value) {
  // 特殊处理
  if (key === 'form' && el.tagName === 'INPUT') return false
  // 兜底
  return key in el
}

const renderer = createRenderer({
  createElement(tag) {
    return document.createElement(tag)
  },
  setElementText(el, text) {
    el.textContent = text
  },
  insert(el, parent, anchor = null) {
    // insertBefore 需要锚点元素 anchor
    parent.insertBefore(el, anchor)
  },
  createText(text) {
    return document.createTextNode(text)
  },
  setText(el, text) {
    el.nodeValue = text
  },
  // 将属性设置相关操作封装到patchProps函数中，并作为渲染器选项传递
  patchProps(el, key, prevValue, nextValue) {
    // 匹配以on开头的属性，视其为事件
    if(/^on/.test(key)) {
      // 定义 el._vei 为一个对象，存在事件名称到事件处理器的映射
      const invokers = el._vei || (el._vei = {})
      // 获取为该元素伪造的事件处理器invoker
      let invoker = invokers[key]
      // 根据属性名称得到对应的事件名称，例如onClick ---> click
      const name = key.slice(2).toLowerCase()
      if (nextValue) {
        if (!invoker) {
          // 如果没有invoker，则将一个伪造的invoker缓存到el._vei中
          // vei是vue event invoker的首字母缩写
          invoker = el._vei[key] = (e) => {
            // e.timestamp是事件发生时间
            // 如果事件发生的时间早于事件处理函数绑定的时间，则不执行事件处理函数
            if(e.timestamp < invoker.attached) return
            // 如果invoker.value是数组，则遍历它并逐个调用事件处理函数
            if(Array.isArray(invoker.value)) {
              invoker.value.forEach(fn => fn(e))
            } else {
              // 否则直接作为函数调用
              invoker.value(e)
            }
          }
          // 将真正的事件处理函数赋值给invoker.value
          invoker.value = nextValue
          // 添加invoker.attached属性，储存时间处理函数被绑定的时间
          invoker.attached = performance.now()
          // 绑定invoker作为事件处理函数
          el.addEventListener(name, invoker)
        } else {
          // 如果invoker存在，意味着更新，并且只需要更新invoker.value的值即可
          invoker.value = nextValue
        }
      } else if (invoker) {
        // 新的事件绑定函数不存在，且之前绑定的invoker存在，则移除绑定
        el.removeEventListener(name, invoker)
      }
    }
    // 对class进行特殊处理
    else if(key === 'class') {
      el.className = nextValue || ''
    }else if (shouldSetAsProps(el,key)) {
      const type = typeof el[key]
      if(type === 'boolean' && nextValue === '') {
        el[key] = true
      } else {
        el[key] = nextValue
      }
    } else {
      el.setAttribute(key, nextValue)
    }
  }
})