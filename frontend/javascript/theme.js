document.getElementById('theme-toggle').addEventListener('click', function() {
    let themeLink = document.getElementById('theme-link');
    if (themeLink.getAttribute('href') == 'normal.css') {
        themeLink.setAttribute('href', 'dark.css');
    } else {
        themeLink.setAttribute('href', 'normal.css');
    }
});
