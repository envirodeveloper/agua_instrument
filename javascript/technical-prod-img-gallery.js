const thumbnails = document.querySelectorAll('.dr900-thumbnail');
const mainImage = document.querySelector('.dr900-main-image');

thumbnails.forEach((thumbnail) => {
    thumbnail.addEventListener('click', () => {
        // Remove 'active' class from all thumbnails
        thumbnails.forEach((thumb) => thumb.classList.remove('active'));

        // Set clicked thumbnail as active
        thumbnail.classList.add('active');

        // Change main image source to the clicked thumbnail's source
        mainImage.src = thumbnail.src;

        // Optional: Add a CSS class for image transition effect
        mainImage.classList.add('fade-in');
        setTimeout(() => {
            mainImage.classList.remove('fade-in');
        }, 300);
    });
});







/*  chlorine analyzer *///////////////////////////////////////////////
// Functionality for CL17sc images
const cl17scThumbnails = document.querySelectorAll('.cl17sc-thumbnail');
const cl17scMainImage = document.querySelector('.cl17sc-main-image');

cl17scThumbnails.forEach((thumbnail) => {
    thumbnail.addEventListener('click', () => {
        cl17scThumbnails.forEach((thumb) => thumb.classList.remove('active'));
        thumbnail.classList.add('active');
        cl17scMainImage.src = thumbnail.src;
        cl17scMainImage.classList.add('fade-in');
        setTimeout(() => {
            cl17scMainImage.classList.remove('fade-in');
        }, 300);
    });
});


/*************  tu5200 lab  ******************************* */


document.addEventListener('DOMContentLoaded', function() {
    const thumbnails = document.querySelectorAll('.tu5200-thumbnail');
    const mainImage = document.querySelector('.tu5200-main-image');

    thumbnails.forEach((thumbnail) => {
        thumbnail.addEventListener('click', () => {
            // Remove 'active' class from all thumbnails
            thumbnails.forEach((thumb) => thumb.classList.remove('active'));

            // Set clicked thumbnail as active
            thumbnail.classList.add('active');

            // Change main image source to the clicked thumbnail's source
            mainImage.src = thumbnail.src;

            // Optional: Add a CSS class for image transition effect
            mainImage.classList.add('fade-in');
            setTimeout(() => {
                mainImage.classList.remove('fade-in');
            }, 300);
        });
    });
});
