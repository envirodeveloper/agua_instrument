document.addEventListener('DOMContentLoaded', () => {
    const wrapper = document.getElementById('testimonials-wrapper');
    const leftArrow = document.getElementById('left-arrow');
    const rightArrow = document.getElementById('right-arrow');

    let currentIndex = 0;

    leftArrow.addEventListener('click', () => {
      if (currentIndex > 0) {
        currentIndex--;
        wrapper.style.transform = `translateX(-${currentIndex * 320}px)`;
      }
    });

    rightArrow.addEventListener('click', () => {
      if (currentIndex < wrapper.children.length - 1) {
        currentIndex++;
        wrapper.style.transform = `translateX(-${currentIndex * 320}px)`;
      }
    });
  });