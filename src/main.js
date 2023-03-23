import { createApp } from 'vue'
import App from './App.vue'
import HttpGetPlugin from './HttpGetPlugin'

let init = false;

function initializeApp() {
    if (!init) {
        let app = createApp(App);
        app.use(HttpGetPlugin, {});
        app.mount('#app');
    }
    init = true;
}

window.initializeApp = initializeApp;
