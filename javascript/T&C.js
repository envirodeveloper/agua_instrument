document.addEventListener('DOMContentLoaded', function() {
    const sliderWrapper = document.querySelector('.slider-wrapper');
    const slides = document.querySelectorAll('.slider-slide');
    const prevButton = document.querySelector('.prev');
    const nextButton = document.querySelector('.next');
    let currentIndex = 0;

    function updateSlider() {
        sliderWrapper.style.transform = `translateX(-${currentIndex * 100}%)`;
        updateNavButtons();
    }

    function updateNavButtons() {
        prevButton.disabled = currentIndex === 0;
        nextButton.disabled = currentIndex === slides.length - 1;
    }

    prevButton.addEventListener('click', function() {
        if (currentIndex > 0) {
            currentIndex--;
            updateSlider();
        }
    });

    nextButton.addEventListener('click', function() {
        if (currentIndex < slides.length - 1) {
            currentIndex++;
            updateSlider();
        }
    });

    updateNavButtons(); // Initial call to set button states
});
