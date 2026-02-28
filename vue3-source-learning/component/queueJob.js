/**
 * ----------------------------------------
 * 任务调度器（简易版）
 * ----------------------------------------
 *
 * 用于将副作用任务（如组件更新）进行：
 *   - 去重
 *   - 异步调度（微任务）
 *   - 批量执行
 *
 * 是 Vue3 “响应式 → 渲染更新” 的关键桥梁
 * 
 * 组件更新为什么要设计为异步调度：
 *   - 减少冗余的重复更新（比如一个循环内修改某属性1000次）
 *   - 排序、批处理，保证从父组件开始向子组件更新（这里是简化版的代码，没有体现）
 *     - 如果父组件更新过程中销毁了子组件，可以跳过子组件的更新任务
 *     - 父组件更新时可能修改子组件的props，按顺序更新，子组件才能以正确的prop更新
 */

// 任务缓存队列，用一个 Set 数据结构来表示，这样就可以自动对任务进行去重
const queue = new Set()
// 一个标志，代表是否正在刷新任务队列
let isFlushing = false
// 创建一个立即 resolve 的 Promise 实例
const p = Promise.resolve()

/**
 * 调度器的主要函数，用来将一个任务添加到缓冲队列中，并开始刷新队列
 *
 * @param {Function} job - 要执行的任务（通常是组件更新函数 effect）
 *
 * @returns {void}
 */
function queueJob(job) {
  // 将 job 添加到任务队列 queue 中
  queue.add(job)
  // 如果还没有注册刷新任务，那么注册一个
  if(!isFlushing) {
    // 将该标志设置为 true 以避免重复刷新
    isFlushing = true
    // 在微任务中刷新缓冲队列
    p.then(() => {
      try {
        // 执行任务队列中的任务
        queue.forEach(job => job())
      } finally {
        // 重置状态
        isFlushing = false
        queue.clear()
      }
    })
  }
}