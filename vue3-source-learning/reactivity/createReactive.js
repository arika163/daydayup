/**
 * 响应式依赖存储容器
 *
 * 数据结构说明：
 *
 * bucket（WeakMap）
 *   └── target（原始对象）
 *         └── key（属性名）
 *               └── deps（Set<effectFn> 称为这个 key 的依赖集合）
 *
 * ----------------------------------------
 * 结构展开
 * ----------------------------------------
 *
 * bucket = {
 *   target1: {
 *     key1: [effectFn1, effectFn2],
 *     key2: [effectFn3]
 *   },
 *   target2: {
 *     key1: [effectFn4]
 *   }
 * }

 * ----------------------------------------
 * 作用
 * ----------------------------------------
 *
 * 1. 在 track 阶段：
 *    - 收集依赖当前 key 的 effect（即activeEffect）
 *
 * 2. 在 trigger 阶段：
 *    - 根据 target + key 找到对应 effect 并执行
 *
 * ----------------------------------------
 * 为什么是 WeakMap？
 * ----------------------------------------
 *
 * - key 是对象（target）
 * - 弱引用，不阻止垃圾回收
 * - 避免响应式对象导致内存泄漏
 *
 */
const bucket = new WeakMap()


/**
 * 创建响应式代理对象（Vue3 响应式核心）
 *
 * 核心能力：
 * - 基于 Proxy 拦截对象操作（get / set / has / delete / ownKeys）
 * - 实现依赖收集（track）与触发更新（trigger）
 * - 支持深/浅响应 & 只读模式
 * - 自动对嵌套对象进行递归代理（惰性）
 *
 * ----------------------------------------
 * 依赖收集时机（track）
 * ----------------------------------------
 * - get
 * - has（in 操作符）
 *
 * ----------------------------------------
 * 触发更新时机（trigger）
 * ----------------------------------------
 * - set（新增 / 修改）
 * - delete
 * - ownKeys（影响 for...in / Object.keys）
 *
 * ----------------------------------------
 * Proxy 拦截概览
 * ----------------------------------------
 *
 * ▶ get(target, key, receiver)
 *   - 拦截属性访问 如：obj.foo
 *   - 依赖收集 target + key ---> Set<effectFn>
 * 
 * ▶ ownKeys(target)
 *   - 拦截 for ... in 循环
 *   - 依赖收集 target + ITERATE_KEY ---> Set<effectFn>
 *
 * ▶ has(target, key)
 *   - 拦截 in 操作符，如：'foo' in p
 *   - 依赖收集 target + key ---> Set<effectFn>
 * 
 * ▶ set(target, key, value, receiver)
 *   - 拦截属性设置，如：obj.foo = 1
 *   - 根据 target + key ，执行收集的副作用函数
 *   - 特殊操作类型（ADD），执行 ITERATE_KEY 下收集的副作用函数
 * 
 * ▶ deleteProperty(target, key)
 *   - 拦截属性删除，如：delete p.foo
 *   - 根据 target + key ，执行收集的副作用函数
 *   - 执行 ITERATE_KEY 下收集的副作用函数
 *
 */
function createReactive(obj, isShallow = false, isReadonly = false) {
  return new Proxy(obj, {
    // 拦截读取操作
    get(target, key, receiver) {
      // 代理对象可以通过raw属性访问原始数据
      if (key === 'raw') {
        return target
      }

      // 如果操作的目标对象是数组，并且key存在于arrayInstrumentations上，
      // 那么返回定义在arrayInstrumentation上的值
      // 详见独立文件
      if(Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key)) {
        return Reflect.get(arrayInstrumentations, key, receiver)
      }

      // 非只读的时候才需要建立响应联系
      // 添加判断，如果key的类型是symbol，则不进行追踪
      if(!isReadonly && typeof key !== 'symbol') {
        // 将副作用函数 activeEffect 添加到存储副作用函数的桶中
        track(target, key)
      }

      // 得到原始值结果
      const res = Reflect.get(target, key, receiver) // 使用 reflect 的原因参考 5.1 节

      // 如果是浅响应，则直接返回原始值
      if(isShallow) {
        return res
      }

      if (typeof res === 'object' && res !== null) {
        // 调用 reactive 将结果包装成响应式数据并返回
        // 如果数据为只读，则调用 readonly 对值进行包装
        return isReadonly ? readonly(res) : reactive(res)
      }
      // 返回res
      return res
    },
    // 拦截设置操作
    set(target, key, newVal, receiver) {
      // 如果是只读的，则打印警告信息并返回
      if (isReadonly) {
        console.warn(`属性 ${key} 是只读的`)
        return true
      }

      const oldVal = target[key]

      // 确定是新增属性还是修改属性
      // 因为新增属性的场合，应该把 ITERATE_KEY 相关的副作用函数也拿出来执行（见 proxy -> ownkeys）
      const type = Array.isArray(target)
        // 如果代理目标是数组，则检测被设置的索引值是否小于数组长度，
        // 如果是，则视作SET操作，否则是ADD操作
        ? Number(key) < target.length ? 'SET' : 'ADD'
        : Object.prototype.hasOwnProperty.call(target, key) ? 'SET' : 'ADD'

      const res = Reflect.set(target, key, newVal, receiver)

      // target === receiver.raw 说明 receiver 就是 target 的代理对象
      // 只有当 receiver 是 target 的代理对象时，才应该触发更新
      // 这是为了避免原型链上的响应式对象引起更新问题 详见 5.4 节
      if (target === receiver.raw) {
        // 比较新值与旧值，只有当他们不全等，并且不都是 NaN 的时候才触发响应
        if (oldVal !== newVal && (oldVal === oldVal || newVal === newVal)) {
          trigger(target, key, type, newVal)
        }
      }

      return res
    },
    has(target, key) {
      track(target, key)
      return Reflect.has(target, key)
    },
    deleteProperty(target, key) {
      // 如果是只读的，则打印警告信息并返回
      if(isReadonly) {
        console.warn(`属性 ${key} 是只读的`)
        return true
      }

      // 检查被操作的属性是否是对象自己的属性
      const hadKey = Object.prototype.hasOwnProperty.call(target, key)
      // 使用 Reflect.deleteProperty 完成属性的删除
      const res = Reflect.deleteProperty(target, key)

      if (res && hadKey) {
        // 只有当被删除的属性时对象自己的属性并且成功删除时，才触发更新
        // 传入类型为 'DELETE'，意味着需要执行 ITERATE_KEY 相关的 effect
        trigger(target, key, 'DELETE')
      }

      return res
    },
    ownKeys(target) {
      // 如果操作目标target是数组，则使用length属性作为key并建立响应联系
      track(target, Array.isArray(target) ? 'length' : ITERATE_KEY)
      return Reflect.ownKeys(target)
    }
  })
}



/**
 * 收集依赖
 *
 * 核心作用：
 * - 在读取数据时，建立“属性 → 副作用函数”的依赖关系
 *
 * ----------------------------------------
 * 触发时机
 * ----------------------------------------
 * - 在 Proxy 的 get / ownKeys / has 拦截中调用
 *
 * ----------------------------------------
 * 核心流程
 * ----------------------------------------
 *
 * 1. 获取 target 对应的 depsMap（Map）
 *    - 不存在则创建（惰性创建）
 *
 * 2. 获取 key 对应的 deps（Set）
 *    - 不存在则创建（惰性创建）
 *
 * 3. 建立依赖关系（双向）
 *    - deps.add(activeEffect)
 *    - activeEffect.deps.push(deps) 
 *
 * ----------------------------------------
 * 为什么要双向记录？
 * ----------------------------------------
 *
 * 用于 cleanup：
 *
 * 当 effect 重新执行时：
 * - 需要把旧依赖全部移除
 * - 再重新收集新依赖
 *
 */
function track(target, key) {
  // 没有 activeEffect 直接return
  if (!activeEffect || !shouldTrack) return

  // 获取 target 对应的 depsMap（Map）
  //   - 不存在则创建（惰性创建）
  let depsMap = bucket.get(target)
  if (!depsMap) {
    bucket.set(target, (depsMap = new Map()))
  }

  // 获取 key 对应的 deps（Set）
  //   - 不存在则创建（惰性创建）
  let deps = depsMap.get(key)
  if (!deps) {
    depsMap.set(key, (deps = new Set()))
  }

  // 把当前激活的副作用函数添加到依赖集合 deps 中
  deps.add(activeEffect)

  // deps 就是一个与当前副作用函数存在联系的依赖集合
  // 将其添加到 activeEffect.deps 数组中
  // 这样可以是使副作用函数可以找到收集了自己的地方
  
  // cleanup 操作时，可以通过 effect.deps 进行依赖清理
  activeEffect.deps.push(deps)
}

/**
 * 触发依赖更新（Dependency Triggering）
 *
 * 核心作用：
 * - 在数据发生变化时，找到相关副作用函数并执行
 *
 * ----------------------------------------
 * 触发时机
 * ----------------------------------------
 * - Proxy 的 set / deleteProperty / 数组 length 修改
 *
 * ----------------------------------------
 * 核心流程
 * ----------------------------------------
 *
 * 1. 获取 target 对应的 depsMap
 * 2. 根据 key 找到直接相关的 effects
 * 3. 构建 effectsToRun（避免重复 & 避免死循环）
 * 4. 根据不同操作类型，补充额外依赖：
 *    - ITERATE_KEY（for...in / Map 遍历）
 *    - MAP_KEY_ITERATE_KEY（Map key 遍历）
 *    - length（数组新增）
 *    - index >= new length（数组截断）
 * 5. 执行副作用函数（支持 scheduler）
 *
 * ----------------------------------------
 * effectsToRun 设计
 * ----------------------------------------
 *
 * - 使用 Set 去重
 * - 避免在遍历过程中修改原始依赖集合
 *
 * ----------------------------------------
 * 特殊处理逻辑
 * ----------------------------------------
 *
 * ▶ 1. 普通属性更新
 * - 触发 depsMap.get(key)
 *
 * ▶ 2. ADD / DELETE
 * - 触发 ITERATE_KEY（影响遍历）
 *
 * ▶ 3. Map 类型
 * - SET：触发 ITERATE_KEY
 * - ADD / DELETE：触发
 *   - ITERATE_KEY
 *   - MAP_KEY_ITERATE_KEY
 *
 * ▶ 4. 数组处理
 *
 * （1）新增元素（ADD）
 * - 触发 length 依赖
 *
 * （2）修改 length
 * - 触发所有 index >= new length 的依赖
 *
 * ----------------------------------------
 * 调度执行（scheduler）
 * ----------------------------------------
 *
 * - 如果 effectFn.options.scheduler 存在：
 *     → 交给调度器执行（如微任务队列）
 *
 * - 否则：
 *     → 直接执行 effectFn
 *
 * ----------------------------------------
 * 数据流
 * ----------------------------------------
 *
 * 修改数据：
 *   obj.foo = 1
 *     ↓
 *   trigger(target, 'foo')
 *     ↓
 *   找到 bucket[target]['foo']
 *     ↓
 *   执行所有 effectFn
 *
 */
function trigger(target, key, type, newVal) {
  const depsMap = bucket.get(target)
  if (!depsMap) return
  const effects = depsMap.get(key)

  // 新建一个set，避免直接用原set遍历
  // 引起无限循环
  const effectsToRun = new Set() 

  // 如果一个副作用函数读取了一个响应式变量，且
  // 又修改了这个变量的值，这个副作用函数就会引起无限循环
  // 解决办法为：禁止当前正在执行的副作用函数触发自身
  effects &&
    effects.forEach((effectFn) => {
      // 如果 trigger 触发执行的副作用函数与当前正在执行的副作用函数相同，则不触发执行
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn)
      }
    })

  // 当操作类型为 'ADD' 或 'DELETE' 时，应触发与 ITERATE_KEY 相关联的副作用函数重新执行
  // 因为该操作会影响 for...in 循环的执行结果（见proxy->ownkeys）
  if(
    type === 'ADD' ||
    type === 'DELETE' ||
    // 如果操作类型是SET，并且目标对象是Map类型的数据，
    // 也应该触发那些与ITERATE_KEY相关联的副作用函数重新执行
    (
      type === 'SET' &&
      Object.prototype.toString.call(target) === '[object Map]'
    )
  ) {
    const iterateEffects = depsMap.get(ITERATE_KEY)
    iterateEffects && iterateEffects.forEach(effectFn => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn)
      }
    })
  }
  
  if (
    // 操作类型为ADD或DELETE
    (type === 'ADD' || type === 'DELETE') &&
    // 并且是Map类型的数据
    Object.prototype.toString.call(target) === '[object Map]'
  ) {
    // 则取出那些与 MAP_KEY_ITERATE_KEY 相关的副作用函数并执行
    const iterateEffects = depsMap.get(MAP_KEY_ITERATE_KEY)
    iterateEffects && iterateEffects.forEach(effectFn => {
      if(effectFn !== activeEffect) {
        effectsToRun.add(effectFn)
      }
    })
  }

  // 当操作类型为ADD并且目标对象是数组时，应该取出并执行那些与 length 属性相关的副作用函数
  if(type === 'ADD' && Array.isArray(target)) {
    // 取出与length相关联的副作用函数
    const lengthEffects = depsMap.get('length')
    // 将这些副作用函数添加到 effectsToRun 中，待执行
    lengthEffects && lengthEffects.forEach(effectFn => {
      if (effectFn !== activeEffect) {
        effectsToRun.add(effectFn)
      }
    })
  }
  
  // 如果操作目标是数组，并且修改了数组的length属性
  if(Array.isArray(target) && key === 'length') {
    // 对于索引大于或等于新的 length 值的元素
    // 需要把所有相关联的副作用函数取出并添加到effectsToRun中待执行
    depsMap.forEach((effects, key) => {
      if(key >= newVal) {
        effects.forEach(effectFn => {
            if(effectFn !== activeEffect) {
              effectsToRun.add(effectFn)
            }
        })
      }
    })
  }
  
  // 执行副作用函数时，要看是否存在调度器
  // 如果存在调度器，应该使用调度器来执行
  effectsToRun.forEach((effectFn) => {
    // 如果一个副作用函数存在调度器，则调用该调度器，并将副作用函数作为参数传递
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn)
    } else {
      // 否则直接执行副作用函数（之前的默认行为）
      effectFn()
    }
  })
}

// 定义一个Map实例，存储原始对象到代理对象的映射
const reactiveMap = new Map()

function reactive(obj) {
  // 优先通过原始对象obj寻找之前创建的代理对象，如果找到了，直接返回已有的代理对象
  const existionProxy = reactiveMap.get(obj)
  if(existionProxy) return existionProxy

  // 否则，创建新的代理对象
  const proxy = createReactive(obj)
  // 存储到Map中，从而避免重复创建
  reactiveMap.set(obj, proxy)

  return proxy
}

function shallowReactive(obj) {
  return createReactive(obj, true)
}

function readonly(obj) {
  return createReactive(obj, false, true)
}

function shallowReadonly(obj) {
  return createReactive(obj, true, true)
}

