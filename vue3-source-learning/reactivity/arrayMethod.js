// 定义需要特殊处理的数组方法
const arrayInstrumentations = {}

/**
 *  重写数组的查找方法
 *  因为这些方法需要对下面两种入参均生效：
 *   - 数组原始子元素
 *   - 数组子元素的代理对象
 */ 
;['includes', 'indexOf', 'lastIndexOf'].forEach(method => {
  const originMethod = Array.prototype[method]
  arrayInstrumentations[method] = function(...args) {
    // this 是代理对象，先在代理对象中查找，将结果存储到res中
    let res = originMethod.apply(this, args)

    if(res === false || res === -1) {
      // res为false说明没找到，通过this.raw拿到原始数组，再去其中查找，并更新res值
      res = originMethod.apply(this.raw, args)
    }
    // 返回最终结果
    return res
  }
})

/**
 * 重写隐式修改数组长度的方法
 * 因为这些函数的执行会间接读取数组的 length 属性
 * 导致数组 length 改变时，这些副作用函数错误地被触发
 * 
 * 典型案例：两个调用push的effect循环触发，导致栈溢出
 */
// 一个标记变量，代表是否进行追踪。默认值为true，即允许追踪
let shouldTrack = true
// 重写数组的push、pop、shift、unshift以及splice方法
;['push', 'pop', 'shift', 'unshift', 'splice'].forEach(method => {
  const originMethod = Array.prototype[method]
  arrayInstrumentations[method] = function(...args) {
    shouldTrack = false
    let res = originMethod.apply(this, args)
    shouldTrack = true
    return res
  }
})