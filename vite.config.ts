/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2023-02-21 23:46:45
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2023-03-14 23:20:37
 */
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  // 打包配置
  build: {
    lib: {
      entry: 'src/main.ts', // 设置入口文件
      name: 'notifyServer', // 起个名字，安装、引入用
      fileName: (format) => `draw-starts-notify-serve.${format}.js` // 打包后的文件名
    },
    sourcemap: true, // 输出.map文件
    rollupOptions: {
      // 确保外部化处理那些你不想打包进库的依赖
      external: ['loadsah'],
      output: {
        // 在 UMD 构建模式下为这些外部化的依赖提供一个全局变量
        globals: {
          loadsah: '_',
        }
      }
    }
  },
  plugins: []
})
