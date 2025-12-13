// 题：两数相加
// 给你两个非空的链表，表示两个非负的整数。
// 它们每位数字都是按照逆序的方式存储的，并且每个节点只能存储一位数字。
// 请你将两个数相加，并以相同形式返回一个表示和的链表。
// 你可以假设除了数字0之外，这两个数都不会以0开头。

// 示例：
// 输入：l1 = [2,4,3], l2 = [5,6,4]
// 输出：[7,0,8]
// 解释：342 + 465 = 807.

function ListNode(val, next) {
  this.val = val === undefined ? 0 : val
  this.next = next === undefined ? null : next
}

const addTwoNumbers = function (l1, l2) {
  let head = null,
    tail = null
  let carry = 0
  while (l1 || l2) {
    const n1 = l1 ? l1.val : 0
    const n2 = l2 ? l2.val : 0
    const sum = n1 + n2 + carry
    if (!head) {
      head = tail = new ListNode(sum % 10)
    } else {
      tail.next = new ListNode(sum % 10)
      tail = tail.next
    }
    carry = Math.floor(sum / 10)
    if (l1) {
      l1 = l1.next
    }
    if (l2) {
      l2 = l2.next
    }
  }
  if (carry > 0) {
    tail.next = new ListNode(carry)
  }
  return head
}

export default addTwoNumbers
