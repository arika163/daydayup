/**
 * Transition 组件（简化实现）
 * 
 * Vue3 内置的过渡组件，本质是一个“行为增强器”，
 * 它不会真正渲染 DOM，而是通过为子 VNode 注入 transition 钩子，
 * 让渲染器在挂载/卸载时执行过渡逻辑。
 * 
 * ----------------------------------------
 * 核心思想
 * ----------------------------------------
 * 1. Transition 本身不产生真实 DOM
 * 2. 只处理其默认插槽的第一个子节点（innerVNode）
 * 3. 在该 VNode 上挂载 transition 对象（钩子集合）
 * 4. 渲染器在 mount/unmount 时识别并调用这些钩子
 * 
 * ----------------------------------------
 * 执行流程
 * ----------------------------------------
 * setup → 返回 render函数
 * render → 获取 slots.default() → innerVNode
 *        → 给 innerVNode 添加 transition 钩子
 *        → 返回 innerVNode（直接透传）
 * 
 * ----------------------------------------
 * transition 对象结构
 * ----------------------------------------
 * transition = {
 *   beforeEnter(el)   // 进入前（DOM 插入前）
 *   enter(el)         // 进入中（DOM 插入后）
 *   leave(el, done)   // 离开（卸载时）
 * }
 * 
 * ----------------------------------------
 * 各阶段行为说明
 * ----------------------------------------
 * 
 * ✔ beforeEnter(el)
 *   - 添加初始 class
 *   - enter-from / enter-active
 * 
 * ✔ enter(el)
 *   - 下一帧切换状态（避免样式合并）
 *   - enter-from → enter-to
 *   - transitionend 后清理 class
 * 
 * ✔ leave(el, performRemove)
 *   - 添加 leave-from / leave-active
 *   - 强制 reflow（确保初始状态生效）
 *   - 下一帧切换为 leave-to
 *   - 结束后调用 performRemove() 真正卸载 DOM
 * 
 * ----------------------------------------
 * 关键实现细节
 * ----------------------------------------
 * 
 * 1. nextFrame()
 *    - 通常是两次 requestAnimationFrame
 *    - 保证浏览器完成一次渲染再切换状态
 * 
 * 2. 强制 reflow
 *    - 通过读取 offsetHeight 触发
 *    - 确保初始 class 生效（否则动画不触发）
 * 
 * 3. transitionend 监听
 *    - 用于收尾（移除 class / 卸载 DOM）
 * 
 * ----------------------------------------
 * 与渲染器的协作
 * ----------------------------------------
 * 
 * 渲染器在以下阶段调用：
 * 
 * - mountElement:
 *     beforeEnter → 插入 DOM → enter
 * 
 * - unmount:
 *     leave(el, performRemove)
 * 
 * ----------------------------------------
 * 注意点 / 限制
 * ----------------------------------------
 * 
 * 1. slots.default() 应只返回一个根节点
 * 
 * 2. Transition 不会自己触发更新
 *    - 更新来自父组件重新 render
 * 
 * 3. 只是“VNode增强”，不是响应式核心
 * 
 * ----------------------------------------
 * 本质总结
 * ----------------------------------------
 * 
 * Transition ≈ 带副作用的 VNode 装饰器
 * 
 */
const Transition = {
  name: 'Transition',
  setup(props, { slots }) {
    return () => {
      // 通过默认插槽获取需要过渡的元素
      const innerVNode = slots.default()

      // 在过渡元素的 VNode 对象上添加 transition 相应的钩子函数
      innerVNode.transition = {
        beforeEnter(el) {
          // 设置初始状态：添加 enter-from 和 enter-active 类
          el.classList.add('enter-from')
          el.classList.add('enter-active')
        },
        enter(el) {
          // 在下一帧切换到结束状态
          nextFrame(() => {
            // 移除 enter-from 类，添加 enter-to 类
            el.classList.remove('enter-from')
            el.classList.add('enter-to')
            // 监听 transitionend 事件完成收尾工作
            el.addEventListener('transitionend',() => {
              el.classList.remove('enter-to')
              el.classList.remove('enter-active')
            })
          })
        },
        leave(el, performRemove) {
          // 设置离场过渡的初始状态：添加 leave-from 和 leave-active 类
          el.classList.add('leave-from')
          el.classList.add('leave-active')
          // 强制 reflow，使得初始状态生效
          document.body.offsetHeight
          // 在下一帧修改状态
          nextFrame(() => {
            // 移除 leave-from 类，添加 leave-to 类
            el.classList.remove('leave-from')
            el.classList.add('leave-to')
          })

          // 监听 transitionend 事件完成收尾工作
          el.addEventListener('transitionend', () => {
            el.classList.remove('leave-to')
            el.classList.remove('leave-active')
            // 调用 transition.leave 钩子函数的第二个参数，完成 DOM 元素的卸载
            performRemove()
          })
        }
      }

      // 渲染需要过渡的元素
      return innerVNode
    }
  }
}