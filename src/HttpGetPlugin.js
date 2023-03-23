export default {
    install: (app, options) => {
        app.config.globalProperties.getJSON = (url) => {
            return new Promise((resolve, reject) => {
                let xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState === 4) {
                        if (xhr.status === 200) {
                            resolve(JSON.parse(xhr.response));
                        }
                        else {
                            reject({status: xhr.status, message: xhr.response});
                        }
                    }
                };
                xhr.open('GET', url, true);
                xhr.send();
            });
        };
        
        app.config.globalProperties.getCSV = (url) => {
            return new Promise((resolve, reject) => {
                let xhr = new XMLHttpRequest();
                xhr.onreadystatechange = () => {
                    if (xhr.readyState === 4) {
                        if (xhr.status === 200) {
                            let csv = xhr.response.split(/\r?\n/).filter(el => el.length !== 0)
                                                  .map(line => line.split(','));
                            resolve(csv);
                        }
                        else {
                            reject({status: xhr.status, message: xhr.response});
                        }
                    }
                };
                xhr.open('GET', url, true);
                xhr.send();
            });
        };
    }
}