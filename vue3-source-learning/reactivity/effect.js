/**
 * effect 的核心职责：
 * 1. 包装用户传入的副作用函数 fn，生成 effectFn
 * 2. 在执行过程中开启依赖收集（通过 activeEffect）
 * 3. 维护副作用栈 effectStack，支持嵌套 effect
 * 4. 在每次执行前进行 cleanup，避免“分支切换”导致的依赖残留
 */

// 用一个全局变量存储当前激活的 effect 函数
let activeEffect // 该 effect 函数，会在 track 执行时被收集至 bucket 中（即：依赖收集）
// effect 栈，用于处理 effect 嵌套执行场景
const effectStack = []

// effect 函数用于注册副作用函数
// 将传入的函数fn，包装为能被依赖收集的effectFn
// 非lazy场景下，会直接执行一次，完成依赖收集
// lazy场景下，直接返回effectFn
function effect(fn, options = {}) {
  const effectFn = () => {
    // 调用 cleanup 函数完成清除工作，清除之前收集了effectFn的地方，防止分支切换产生遗留
    cleanup(effectFn)

    // 当 effectFn 执行时，将其设置为当前激活的副作用函数
    activeEffect = effectFn
    // 在调用副作用函数之前将当前副作用函数压入栈中
    effectStack.push(effectFn)

    // 执行时如果读取了响应式数据，activeEffectFn会被收集，执行一遍就完成了一次新的依赖收集
    const res = fn() // 将fn的执行结果存储到res中，后面返回

    // 在当前副作用函数执行完毕后，将当前副作用函数弹出栈，并把 activeEffect 还原为之前的值
    effectStack.pop()
    activeEffect = effectStack[effectStack.length - 1]
    
    // 对于计算属性来说，fn 就是 getter
    // res 会被作为 getter 的返回值
    // 因此这里需要将 res 返回
    return res
  }

  // 将options挂载到effectFn上
  effectFn.options = options
  // activeEffects.deps 用来存储所有与该副作用函数相关联的依赖集合
  effectFn.deps = [] // 简单来说，就是哪里收集了我

  // 只有非lazy的时候，才执行
  if (!options.lazy) {
    // 执行副作用函数
    effectFn()
  }

  // 将副作用函数作为返回值返回
  // 懒执行场景，后续可以手动执行 effectFn
  return effectFn
}

// 将所有收集了effectFn的deps拿出来，去掉effectFn
function cleanup(effectFn) {
  // 遍历 effectFn.deps 数组
  for (let i = 0; i < effectFn.deps.length; i++) {
    // deps 是依赖集合
    const deps = effectFn.deps[i]
    // 将effectFn 从依赖集合中移除
    deps.delete(effectFn)
  }
  // 最后需要重置 effectFn.deps 数组
  effectFn.deps.length = 0
}

// 分支切换，示例
effect(function effectFn() {
  document.body.innerText = obj.ok ? obj.text : 'not'
})