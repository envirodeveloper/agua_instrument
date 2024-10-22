var countDownDate = new Date();
countDownDate.setDate(countDownDate.getDate() + 30); // 30 days from now

// Update the countdown every second
var countdownTimer = setInterval(function() {
    // Get the current date and time
    var now = new Date().getTime();

    // Find the time difference between now and the countdown date
    var distance = countDownDate - now;

    // Calculate days, hours, minutes, and seconds remaining
    var days = Math.floor(distance / (1000 * 60 * 60 * 24));
    var hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    var seconds = Math.floor((distance % (1000 * 60)) / 1000);

    // Display the countdown
    document.getElementById("countdown").innerHTML = days + "D " + hours + "H " + minutes + "M " + seconds + "S ";

    // If the countdown is over, display a message
    if (distance < 0) {
        clearInterval(countdownTimer);
        document.getElementById("countdown").innerHTML = "EXPIRED";
    }
}, 1000);