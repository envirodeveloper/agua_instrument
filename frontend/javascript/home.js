//industries we serve//

document.addEventListener("DOMContentLoaded", function() {
    const contents = document.querySelectorAll('.content');
    contents.forEach(content => {
      const randomTime = Math.random() * 5000 + 1000; // Random time between 1 and 6 seconds
      setTimeout(() => {
        content.classList.add('hover');
      }, randomTime);
    });
  });