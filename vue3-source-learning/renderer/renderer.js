/**
 * 内置 vnode 类型标识（用于区分节点种类）
 *
 * @constant {Symbol} Text - 文本节点
 * @constant {Symbol} Comment - 注释节点
 * @constant {Symbol} Fragment - 片段节点（多子节点容器，无实际 DOM）
 */
const Text = Symbol()
const Comment = Symbol()
const Fragment = Symbol()

/**
 * 创建一个自定义渲染器（Renderer）
 *
 * 核心思想：
 * 👉 通过注入底层平台 API，实现“跨平台渲染”
 *    - 浏览器：DOM
 *    - Native：原生 UI
 *    - Canvas / WebGL：自定义渲染
 *
 * ----------------------------------------
 * 职责
 * ----------------------------------------
 *
 * 1. 接收平台相关操作（DOM API 抽象）
 * 2. 返回统一的 render 函数
 * 3. 内部通过 patch 完成 vnode → 真实视图
 *
 * ----------------------------------------
 *
 * @param {Object} options - 平台相关 API（宿主环境能力）
 *
 * @returns {{ render: (vnode:VNode|null, container:HTMLElement)=>void }}
 */
function createRenderer(options) {

  // 通过 options 得到操作DOM的API
  // 根据传入的API不同，渲染器可以实现跨平台
  // patch 等处理都会用到下面的API
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
        // 旧 vnode 存在，且新 vnode 不存在，说明是卸载操作
        // 调用 unmount 函数卸载 vnode 
        unmount(container._vnode)
      }
    }
    container._vnode = vnode
  }
  
  // patch、unmount等实现见独立文件

  return {
    render
  }
}

/**
 * 判断某个属性是否应该作为 DOM Property 设置
 * 而不是使用 setAttribute
 *
 * @param {HTMLElement} el
 * @param {string} key
 * @param {any} value
 *
 * @returns {boolean}
 */
function shouldSetAsProps(el, key, value) {
  // 特殊处理
  if (key === 'form' && el.tagName === 'INPUT') return false
  // 兜底
  return key in el
}

/**
 * 传入浏览器平台的API
 * 得到浏览器平台的渲染器
 */
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