document.addEventListener('DOMContentLoaded', () => {
    includeHTML();
});

function includeHTML() {
    let elements = document.querySelectorAll('[data-include-html]');
    elements.forEach(el => {
        let file = el.getAttribute('data-include-html');
        fetch(file)
            .then(response => response.text())
            .then(data => {
                el.innerHTML = data;
            })
            .catch(error => console.error('Error loading HTML:', error));
    });
}

function evalScripts(el) {
    let scripts = el.querySelectorAll('script');
    scripts.forEach(script => {
        let newScript = document.createElement('script');
        newScript.type = 'text/javascript';
        if (script.src) {
            newScript.src = script.src;
        } else {
            newScript.innerHTML = script.innerHTML;
        }
        document.head.appendChild(newScript).parentNode.removeChild(newScript);
    });
}
