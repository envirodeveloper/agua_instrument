document.addEventListener('DOMContentLoaded', function() {
    // Find all dropdowns
    const dropdowns = document.querySelectorAll('./nav-item.dropdown');
  
    dropdowns.forEach(function(dropdown) {
      let timeout;
      
      // On mouse enter, show the dropdown menu
      dropdown.addEventListener('mouseenter', function() {
        clearTimeout(timeout);
        this.querySelector('.dropdown-menu').style.display = 'block';
      });
  
      // On mouse leave, hide the dropdown menu after 1 second
      dropdown.addEventListener('mouseleave', function() {
        const menu = this.querySelector('.dropdown-menu');
        timeout = setTimeout(function() {
          menu.style.display = 'none';
        }, 5000);
      });
    });
  });
  