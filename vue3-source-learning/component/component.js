function mountComponent(vnode, container, anchor) {
  // 检查是否是函数式组件
  const isFunctional = typeof vnode.type === 'function'

  // 通过 vnode 获取组件的选项对象，即 vnode.type
  let componentOptions = vnode.type
  if (isFunctional) {
    // 如果是函数式组件，则将 vnode.type 作为渲染函数，将 vnode.type.props 作为 props 选项定义即可
    componentOptions = {
      render: vnode.type,
      props: vnode.type.props
    }
  }

  // 获取组件的渲染函数 render
  const { 
    render, 
    data,
    props: propsOption,
    setup,
    beforeCreate,
    created,
    beforeMount,
    mounted,
    beforeUpdate,
    updated
  } = componentOptions

  // 在这里调用 beforeCreate 钩子
  beforeCreate && beforeCreate()

  // 调用 data 函数得到原始数据，并调用 reactive 函数将其包装为响应式数据
  const state = data ? reactive(data()) : null
  // 调用 resolveProps 函数解析出最终的 props 数据与 attrs 数据
  const [props, attrs] = resolveProps(propsOption, vnode.props)

  // 定义组件实例，一个组件实例本质上就是一个对象，它包含与组件有关的状态信息
  const instance = {
    // 组件自身的状态数据，即data
    state,
    // 将解析出的props数据包装为shallowReactive并定义到组件实例上
    props: shallowReactive(props),
    // 一个布尔值，用来表示组件是否已经被挂载，初始值为 false
    isMounted: false,
    // 组件所渲染的内容，即子树（subTree）
    subTree: null,
    // 将插槽添加到组件实例上
    slots,
    // 在组件实例中添加 mounted 数组，用来存储通过 onMounted 函数注册的生命周期钩子函数
    mounted: [],
    // 只有 KeepAlive 组件的实例下会有 keepAliveCtx
    keepAliveCtx: null
  }

  // 检查当前要挂载的组件是否是 KeepAlive 组件
  const isKeepAlive = vnode.type.__isKeepAlive
  if(isKeepAlive) {
    // 在 KeepAlive 组件实例上添加 keepAliveCtx 对象
    instance.keepAliveCtx = {
      // move 函数用来移动一段 vnode
      move(vnode, container, anchor) {
        // 本质上是将组件渲染的内容移动到指定容器中，即隐藏容器中
        insert(vnode.component.subTree.el, container, anchor)
      },
      createElement
    }
  }

  // 定义 emit 函数，它接收两个参数
  // event： 事件名称
  // payload：传递给事件处理函数的参数
  function emit(event, ...payload) {
    // 根据约定对事件名进行处理，例如 change --> onChange
    const eventName = `on${event[0].toUpperCase() + event.slice(1)}`
    // 根据处理后的事件名称去 props 中寻找对应的事件处理函数
    const handler = instance.props[eventName]
    if(handler) {
      // 调用事件处理函数并传递参数
      handler(...payload)
    } else {
      console.error('事件不存在')
    }
  }

  const slots = vnode.children || {}

  // setup 
  const setupContext = { attrs, emit, slots }
  // 调用 setup 函数，将只读版本的 props 作为第一个参数传递，避免用户意外地修改 props 的值

  // 在调用 setup 函数之前，设置当前组件实例
  setCurrentInstance(instance)
  // 将 setupContext 作为第二个参数传递
  const setupResult = setup(shallowReadonly(instance.props), setupContext)
  // 在setup函数执行完毕之后，重置当前组件实例
  setCurrentInstance(null)


  // setupState 用来存储由 setup 返回的数据
  let setupState = null
  // 如果 setup 函数的返回值是函数，则将其作为渲染函数
  if (typeof setupResult === 'function') {
    // 报告冲突
    if ( render) console.error('setup 函数返回渲染函数， render 选项将被忽略')
    // 将 setupResult 作为渲染函数
    render = setupResult
  } else {
    // 如果 setup 的返回值不是函数，则作为数据状态赋值给 setupState
    setupState = setupResult
  }

  // 将组件实例设置到 vnode 上，用于后续更新
  vnode.component = instance

  // 创建渲染上下文对象，本质上是组件实例的代理
  const renderContext = new Proxy(instance, {
    get(t, k, r) {
      // 取得组件自身状态与props数据
      const { state, props, slots } = t
      // 当 k 的值为 $slots 时，直接返回组件实例上的 slots
      if (k === '$slots') return slots

      // 先尝试读取自身状态数据
      if (state && k in state) {
        return state[k]
      } else if (k in props) {
        return props[k]
      } else if (setupState && k in setupState) {
        // 渲染上下文需要增加对 setupState 的支持
        return setupState[k]
      } else {
        console.error('不存在')
      }
    },
    set(t, k, r, v) {
      const { state, props } = t
      if (state && k in state) {
        state[k] = v
      } else if (k in props) {
        console.warn('Attempting to mutate prop "${k}".Props are readonly.')
      } else if (setupState && k in setupState) {
        // 渲染上下文需要增加对 setupState 的支持
        setupState[k] = v
      } else {
        console.error('不存在')
      }
      return true
    }
  })

  // 在这里调用 created 钩子
  // 生命周期函数调用时要绑定渲染上下文对象
  created && created.call(renderContext)

  // 当组件自身状态发生变化时，我们需要有能力触发组件更新，即：组件的自更新
  // 因此需要将组件的 render 函数调用包装到 effect 内
  effect(() => {
    // 执行渲染函数，获取组件要渲染的内容，即 render 函数返回的虚拟DOM
    // 调用 render 函数时，将其 this 设置为 state
    // 从而 render 函数内部可以通过 this 访问组件自身的数据状态
    const subTree = render.call(renderContext, renderContext)
    // 检查组件是否已经被挂载
    if (!instance.isMounted) {
      // 在这里调用 beforeMount 钩子
      beforeMount && beforeMount.call(renderContext)

      // 初次挂载，调用 patch 函数第一个参数传递null
      patch(null, subTree, container, anchor)
      // 重点：将组件实例的isMounted设置为true，这样当更新发生时就不会再次进行挂载操作
      // 而是会执行更新
      instance.isMounted = true

      // 在这里调用 mounted 钩子
      mounted && mounted.call(renderContext)
      // 遍历 instance.mounted 数组并逐个执行即可
      instance.mounted && instance.mounted.forEach(hook => hook.call(renderContext))
    } else {
      // 在这里调用 beforeUpdate 钩子
      beforeUpdate && beforeUpdate.call(renderContext)

      // 当 isMounted 为 true 时，说明组件已经被挂载，只需要完成自更新即可，
      // 所以在调用 patch 函数时，第一参数为组件上一次渲染的子树，
      // 意思是，使用新的子树与上一次渲染的子树进行打补丁操作
      patch(instance.subTree, subTree, container, anchor)

      // 在这里调用 updated 钩子
      updated && updated.call(renderContext)
    }
    // 更新组件实例的子树
    instance.subTree = subTree
  }, {
    // 指定该副作用函数的调度器为 queueJob 即可
    // 缓冲、去重、异步执行
    scheduler: queueJob
  })
}

// 子组件被动更新
function patchComponent(n1, n2, anchor) {
  // 获取组件实例，即 n1.component，同时让新的组件虚拟节点 n2.component 也指向组件实例
  const instance = (n2.component = n1.component)
  // 获取当前的 props 数据
  const { props } = instance
  // 调用 hasPropsChanged 检测为子组件传递的 props 是否发生变化，如果没有变化，则不需要更新
  if(hasPropsChanged(n1.props, n2.props)) {
    // 调用 resolveProps 函数重新获取 props 数据
    const [ nextProps ] = resolveProps(n2.type.props, n2.props)
    // 更新 props
    for (const k in nextProps) {
      props[k] = nextProps[k]
    }
    // 删除不存在的 props
    for(const k in props) {
      if (!(k in nextProps)) delete props[k]
    }
  } 
}

// resolveProps 函数用于解析组件 props 和 attrs 数据
function resolveProps(options, propsData) {
  const props = {}
  const attrs = {}
  // 遍历为组件传递的 props 数据
  for (const key in propsData) {
    // 以字符串on开头的props，无论是否显式地声明，都将其添加到props数据中，而不是添加到attrs中
    // 这是为了支持自定义事件
    if (key in options || key.startsWith('on')) {
      // 如果为组件传递的 props 数据在组件自身的 props 选项中有定义，则将其视为合法的 props
      props[key] = propsData[key]
    } else {
      // 否则将其作为attrs
      attrs[key] = propsData[key]
    }
  }

  // 最后返回 props 与 attrs 数据
  return [ props, attrs ]
}

function hasPropsChanged (prevProps, nextProps) {
  const nextKeys = Object.keys(nextProps)
  // 如果新旧props的数量变了，则说明有变化
  if(nextKeys.length !== Object.keys(prevProps).length) {
    return true
  }
  
  for (let i = 0; i< nextKeys.length; i++) {
    const key = nextKeys[i]
    // 有不相等的props，则说明有变化
    if(nextProps[key] !== prevProps[key]) return true
  }

  return false
}

// 全局变量，存储当前正在被初始化的组件实例
let currentInstance = null
// 该方法接收组件实例作为参数，并将该实例设置为 currentInstance
function setCurrentInstance(instance) {
  currentInstance = instance
}

// hooks
function onMounted() {
  if (currentInstance) {
    // 将生命周期函数添加到 instance.mounted 数组中
    currentInstance.mounted.push(fn)
  } else {
    console.error('onMounted 函数只能在 setup 中调用')
  }
}