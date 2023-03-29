import { createApp } from 'vue'
import App from './App.vue'
import HttpGetPlugin from './HttpGetPlugin'


let app = createApp(App);
app.use(HttpGetPlugin, {});
app.mount('#app');
