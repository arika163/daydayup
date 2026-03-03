/**
 * 创建一个计算属性（Computed Ref）
 *
 * @param {Function} getter - 计算函数（依赖响应式数据）
 * @returns {{ value: any }} - 带有 value 属性的对象（类似 ref）
 *
 * 核心作用：
 * - 基于响应式数据派生新值
 * - 支持缓存（避免重复计算）
 * - 支持依赖追踪（可被 effect 使用）
 *
 * ----------------------------------------
 * 核心特性
 * ----------------------------------------
 *
 * 1. 惰性计算（lazy）
 *    - getter 不会立即执行，读取时才会执行
 *    - 后续 getter 只有 dirty 时才会重新执行
 *
 * 2. 缓存机制（cache）
 *    - 通过 dirty 标志控制是否重新计算
 *
 * 3. 依赖传递（响应式桥梁）
 *      响应式数据
 *        ↓
 *      computed
 *        ↓
 *      effect
 *
 * ----------------------------------------
 * 执行流程
 * ----------------------------------------
 *
 * 初始化时：
 * - 创建 lazy effect（标记为 dirty，不会立即执行）
 *
 * 外部读取 computed.value 时：
 *   - 依赖收集
 *   - 根据 dirty，确定是否执行一次 getter 获取最新值
 *
 * 依赖变更时：
 *   - scheduler 被触发
 *   - dirty = true（标记失效）
 *   - 传递依赖，通知所有依赖 computed 的 effect 重新执行
 *
 */
function computed(getter) {
  // value 用来缓存上一次计算的值
  let value
  // dirty 标志，用来标识是否需要重新计算值，为true则意味着“脏”，需要计算
  let dirty = true

  // 把 getter 作为副作用函数，创建一个lazy的effect
  const effectFn = effect(getter, {
    lazy: true,
    scheduler() {
      if (!dirty) {
        dirty = true

        // 当计算属性依赖的响应式数据变化时，手动调用trigger函数触发响应

        // 这段逻辑其实承担的是“响应式桥梁”的功能
        // 他的工作是：传递响应式连系
        trigger(obj, 'value') // 响应式事件的传递
      }
    }
  })

  const obj = {
    get value() {
      // 只有“脏”时才计算值，并将得到的值缓存到value中
      if (dirty) {
        value = effectFn()
        // 将 dirty 设置为false，下一次访问直接使用缓存到value中的值
        dirty = false
      }
      // 当读取value时，手动调用track函数进行追踪
      track(obj, 'value') // 这样可以做到把所有依赖这个计算属性的副作用函数收集起来
      return value
    }
  }

  return obj
}
