// document.querySelector('.open-btn').addEventListener('click', function() {
//     document.querySelector('.sidebar').style.left = '0';
//     document.querySelector('.content').style.marginLeft = '250px';
//   });
  
//   document.querySelector('.close-btn').addEventListener('click', function() {
//     document.querySelector('.sidebar').style.left = '-250px';
//     document.querySelector('.content').style.marginLeft = '0';
//   });
  
function toggleSidebar() {
  var sidebar = document.getElementById("sidebar");
  sidebar.classList.toggle("show");
}

function toggleDropdown(section) {
  var dropdown = document.getElementById(section + "-dropdown");
  dropdown.classList.toggle("show");

  var arrow = document.querySelector('.has-dropdown a.' + section + '.arrow');
  arrow.classList.toggle("up", dropdown.classList.contains("show")); // Add this line
}