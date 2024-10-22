<?php


use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;

require('emailservices/PHPMailer.php');
require('emailservices/SMTP.php');
require('emailservices/Exception.php');

$name =$_REQUEST['name'];
$email =$_REQUEST['email'];
$subject =$_REQUEST['subject'];
$body =$_REQUEST['message'];

$mail = new PHPMailer;
$mail->isSMTP();
// $mail->SMTPDebug = 3;
// $mail->Debugoutput = 'html';
$mail->Host = 'smtp.gmail.com';
$mail->Port = 587; //465
$mail->SMTPSecure = 'tls';
$mail->SMTPAuth = true;
$mail->Username = 'support@technicrafts.com'; // Add user Email
$mail->Password = 'techni#2024'; // Add Your Password
// $mail->setFrom('yashwant@technicrafts.com', 'Yashwant vishwakarma');  //Add User Email And Name
$mail->setFrom('support@technicrafts.com', 'Agua Instruments');  //Add User Email And Name
$mail->addAddress('info@aguainstruments.com', 'Agua Instruments');
$mail->Subject = $email;
$mail->msgHTML($body);  
$mail->email = $email ;

if ($mail->Send())                                //Send an Email. Return true on success or false on error
{
    // print_r("Data sucessfully sent ");exit;
    // return true;
    sendResponse(1,'Thank you for enquiry');
} else {
    // echo $mail->ErrorInfo; exit;
    //$message = '<div class="alert alert-danger">There is an Error</div>';
    sendResponse(0,'Failed to Send Email');
}
 
?>



    <!-- if ($mail->Send()) {
print_r("Mail send successfully");exit;
return true;
}
else {
// echo $mail->ErrorInfo; exit;
return false;
} -->