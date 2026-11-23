document.addEventListener("DOMContentLoaded", () => {
  emailjs.init("4trZayuz-uQG6Zu47ri6a");

  const form = document.querySelector(".career-form form");
  const btnText = document.getElementById("career-submit-text");
  const spinner = document.getElementById("career-spinner");

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    btnText.style.display = "none";
    spinner.style.display = "inline-block";

    emailjs
      .sendForm("service_1fflnk9", "template_uih9iqh", this)
      .then(() => {
        alert("Application submitted successfully!");
        form.reset();
      })
      .catch((error) => {
        console.error(error);
        alert("Submission failed. Please try again.");
      })
      .finally(() => {
        btnText.style.display = "inline";
        spinner.style.display = "none";
      });
  });
});
