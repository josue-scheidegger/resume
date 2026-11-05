import { defineClientConfig } from 'vuepress/client'
import ResumeLastUpdated from './components/ResumeLastUpdated.vue'

export default defineClientConfig({
  enhance({ app }) {
    app.component('ResumeLastUpdated', ResumeLastUpdated)
  },
})
