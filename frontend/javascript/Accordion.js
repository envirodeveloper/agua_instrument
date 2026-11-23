document.querySelectorAll('.accordion-button').forEach(button => {
    button.addEventListener('click', () => {
        const accordionBody = button.parentElement.nextElementSibling;

        if (accordionBody.classList.contains('show')) {
            accordionBody.classList.remove('show');
        } else {
            document.querySelectorAll('.accordion-body').forEach(body => {
                body.classList.remove('show');
            });
            accordionBody.classList.add('show');
        }
    });
});
