/**
 * 监听响应式数据变化，并在变化时执行回调
 *
 * @param {Function|Object} source
 * - 数据源：
 *   1. function：getter
 *   2. object：自动深度遍历（traverse）
 *
 * @param {Function} cb
 * - 回调函数
 *   (newValue, oldValue, onInvalidate) => void
 *
 * @param {Object} [options]
 * @param {boolean} [options.immediate=false]
 * - 是否立即执行回调
 *
 * @param {'pre'|'post'|'sync'} [options.flush='pre']
 * - 回调执行时机：
 *   - pre：组件更新前（暂未实现）
 *   - post：组件更新后（加入队列微任务，异步延迟执行）
 *   - sync：同步执行
 *
 * ----------------------------------------
 * 核心能力
 * ----------------------------------------
 *
 * 1. 深度监听 ---> 触发回调
 * 2. 获取新旧值
 * 3. 立即执行功能（immediate）
 * 3. 支持过期的副作用识别（onInvalidate）
 * 4. 控制执行时机（flush）
 *
 * ----------------------------------------
 * onInvalidate
 * ----------------------------------------
 *
 * 用于注册“过期副作用”，解决异步竞态问题
 *
 * 示例：
 *
 * watch(id, async (newId, oldId, onInvalidate) => {
 *   let expired = false
 *
 *   onInvalidate(() => {
 *     expired = true
 *   })
 *
 *   const res = await fetch(`/api/${newId}`)
 *
 *   if (!expired) {
 *     data.value = res
 *   }
 * })
 *
 * 核心思想：
 * - 上一次异步任务失效时，主动取消其影响
 *
 */
function watch(source, cb, options = {}) {
  // 入参 source 可以为 getter
  // 也可以是一个对象，对象场景等效为监听该对象的所有属性
  let getter
  if (typeof source === 'function') {
    getter = source
  } else {
    getter = () => traverse(source)
  }

  // 定义新值与旧值
  let oldValue, newValue

  // cleanup 用来存储用户注册的过期回调
  let cleanup
  // 定义 onInvalidate 函数
  function onInvalidate(fn) {
    // 将过期回调存储到 cleanup 中
    cleanup = fn
  }

  // 提取 scheduler 调度函数为一个独立的 job 函数
  const job = () => {
    // 在 scheduler 中重新执行副作用函数，得到的是新值
    newValue = effectFn()
    // 在调用回调函数cb之前，先调用过期回调
    if (cleanup) {
      cleanup()
    }
    // 将旧值和新值作为回调函数的参数
    cb(newValue, oldValue, onInvalidate)
    // 更新旧值，不然下一次会得到错误的旧值
    oldValue = newValue
  }

  // 使用 effect 注册副作用函数时，开启lazy选项，并把返回值存储到effectFn中以便后续手动调用
  const effectFn = effect(() => getter(), {
    lazy: true,
    scheduler: () => {
      // 在调度函数中判断 flush 是否为 'post',如果是，将其放到微任务队列中执行
      if (options.flush === 'post') {
        const p = Promise.resolve()
        p.then(job)
      } else {
        job()
      }
    }
  })

  if (options.immediate) {
    // 当 immediate 为 true 时立即执行job，从而触发回调执行
    job()
  } else {
    // 调用watch时，getter一定会执行一次
    oldValue = effectFn()
  }
}

// 访问一个对象的所有属性
// 然后返回该对象
function traverse(value, seen = new Set()) {
  // 如果要读取的数据是原始值，或者已经被读取过了，那么什么都不做
  if (typeof value !== 'object' || value === null || seen.has(value)) return
  // 将数据添加到 seen 中，代表遍历地读取过了，避免循环引用引起的死循环
  seen.add(value)
  // 暂时不考虑数组等其他结构
  // 假设 value 就是一个对象，使用 for..in 读取对象的每一个值，并递归地调用 traverse 进行处理
  for (const k in value) {
    traverse(value[k], seen)
  }

  return value
}
