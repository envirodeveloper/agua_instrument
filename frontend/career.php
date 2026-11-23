









<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

// ================= DATABASE CONNECTION =================
$conn = new mysqli("localhost", "u308786844_sales_agua", "jWJeVL22&HT26nV*", "u308786844_career");

if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// ================= GET FORM DATA =================
$name = $_POST['name'];
$mobile = $_POST['mobile'];
$email = $_POST['email'];
$address = $_POST['address'];
$skills = implode(", ", $_POST['skills']);
$experience = $_POST['experience'];
$additional = $_POST['additional_info'];

// ================= FILE UPLOAD =================
$targetDir = "uploads/";

// create folder if not exists
if (!is_dir($targetDir)) {
    mkdir($targetDir, 0777, true);
}

$fileName = time() . "_" . basename($_FILES["resume"]["name"]);
$targetFilePath = $targetDir . $fileName;

// upload file
if (!move_uploaded_file($_FILES["resume"]["tmp_name"], $targetFilePath)) {
    die("Error uploading file");
}

// ================= INSERT INTO DATABASE =================
$sql = "INSERT INTO career_applications 
(name, mobile, email, address, skills, experience, resume, additional_info) 
VALUES ('$name', '$mobile', '$email', '$address', '$skills', '$experience', '$fileName', '$additional')";

if (!$conn->query($sql)) {
    die("Database Error: " . $conn->error);
}

// ================= CREATE RESUME URL =================
// IMPORTANT: Replace with your actual domain
$resumeURL = "https://aguainstruments.com/" . $targetFilePath;

// ================= WHATSAPP MESSAGE =================
$message = urlencode(
"New Job Application:\n\n".
"Name: $name\n".
"Mobile: $mobile\n".
"Email: $email\n".
"Experience: $experience\n".
"Skills: $skills\n".
"Resume: $resumeURL\n"
);

// ================= WHATSAPP NUMBER =================
$phone = "917620971243";

// ================= REDIRECT TO WHATSAPP =================
header("Location: https://wa.me/$phone?text=$message");
exit;

$conn->close();
?>