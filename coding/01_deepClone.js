// 题：使用js实现深拷贝

function deepClone(target, weakMap = new WeakMap()) {
  // 处理基本类型
  if (typeof target !== 'object' || target === null) {
    return target
  }
  // 处理循环引用
  if (weakMap.has(target)) {
    return weakMap.get(target)
  }

  // 数组特殊处理 & 保留原型链
  const result = Array.isArray(target)
    ? []
    : Object.create(Object.getPrototypeOf(target))

  weakMap.set(target, result)

  Reflect.ownKeys(target).forEach((key) => {
    result[key] = deepClone(target[key], weakMap)
  })

  return result
}

export default deepClone
