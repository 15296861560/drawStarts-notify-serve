/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2023-02-26 13:13:39
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2023-03-19 19:09:22
 */
// 生成随机id
export function generateId(len: number = 10) {
    const typeArray = new Uint8Array(len / 2)
    window.crypto.getRandomValues(typeArray)
    return Array.from(typeArray, dec => dec.toString(16).padStart(2, "0")).join('')
}

// mao转对象
export function mapToObject(map: Map<string, any>) {
    const obj = [...map.entries()].reduce((obj: any, [key, value]) => (obj[key] = value, obj), {});
    return obj
}