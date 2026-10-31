@echo off
title LUXE RESTO POS - License Key Generator
cls
echo ====================================================
echo        LUXE RESTO POS - LICENSE GENERATOR
echo ====================================================
echo.
echo Choose which key you want to generate:
echo.
echo  [1] Generate BASIC Key
echo  [2] Generate STANDARD Key
echo  [3] Generate PREMIUM Key
echo  [4] Generate 5 Keys for Each Plan
echo  [5] Exit
echo.
echo ====================================================
set /p choice="Enter choice (1-5): "

if "%choice%"=="5" exit

cls
echo ====================================================
echo        LUXE RESTO POS - LICENSE GENERATOR
echo ====================================================
echo.

set SCRIPT=eval(Buffer.from('CmNvbnN0IGNyeXB0byA9IHJlcXVpcmUoJ2NyeXB0bycpOwpjb25zdCBzYWx0ID0gJ0xVWEVfUkVTVE9fUE9TX1NFQ1JFVF9TQUxUXzk4MjRfS0VZR0VOJzsKY29uc3QgY29kZU1hcCA9IHsgYmFzaWM6ICdCQVMnLCBzdGFuZGFyZDogJ1NURCcsIHByZW1pdW06ICdQUk0nIH07CmZ1bmN0aW9uIG1ha2VLZXkocGxhbikgewogIGNvbnN0IGNvZGUgPSBjb2RlTWFwW3BsYW5dIHx8ICdQUk0nOwogIGNvbnN0IHAxID0gY3J5cHRvLnJhbmRvbUJ5dGVzKDIpLnRvU3RyaW5nKCdoZXgnKS50b1VwcGVyQ2FzZSgpOwogIGNvbnN0IHAyID0gY3J5cHRvLnJhbmRvbUJ5dGVzKDIpLnRvU3RyaW5nKCdoZXgnKS50b1VwcGVyQ2FzZSgpOwogIGNvbnN0IGNoayA9IGNyeXB0by5jcmVhdGVIYXNoKCdzaGEyNTYnKS51cGRhdGUoY29kZSArICctJyArIHAxICsgJy0nICsgcDIgKyAnLScgKyBzYWx0KS5kaWdlc3QoJ2hleCcpLnN1YnN0cmluZygwLCA0KS50b1VwcGVyQ2FzZSgpOwogIHJldHVybiAnTFVYRS0nICsgY29kZSArICctJyArIHAxICsgJy0nICsgcDIgKyAnLScgKyBjaGs7Cn0KY29uc3QgcGxhbiA9IHByb2Nlc3MuYXJndlsxXTsKY29uc3QgY291bnQgPSBwYXJzZUludChwcm9jZXNzLmFyZ3ZbMl0gfHwgJzEnLCAxMCk7CmlmIChwbGFuID09PSAnYWxsJykgewogIFsnYmFzaWMnLCAnc3RhbmRhcmQnLCAncHJlbWl1bSddLmZvckVhY2gocCA9PiB7CiAgICBjb25zb2xlLmxvZygnWycgKyBwLnRvVXBwZXJDYXNlKCkgKyAnIFBMQU4gS0VZU10nKTsKICAgIGZvciAobGV0IGkgPSAxOyBpIDw9IGNvdW50OyBpKyspIGNvbnNvbGUubG9nKCcgIEtleSAnICsgaSArICc6ICcgKyBtYWtlS2V5KHApKTsKICAgIGNvbnNvbGUubG9nKCcnKTsKICB9KTsKfSBlbHNlIHsKICBjb25zb2xlLmxvZygnR2VuZXJhdGVkICcgKyBjb3VudCArICcga2V5KHMpIGZvciBbJyArIHBsYW4udG9VcHBlckNhc2UoKSArICcgUExBTl06Jyk7CiAgZm9yIChsZXQgaSA9IDE7IGkgPD0gY291bnQ7IGkrKykgY29uc29sZS5sb2coJyAgS2V5ICcgKyBpICsgJzogJyArIG1ha2VLZXkocGxhbikpOwp9Cg==', 'base64').toString())

if "%choice%"=="1" (
    node -e "%SCRIPT%" basic 1
)
if "%choice%"=="2" (
    node -e "%SCRIPT%" standard 1
)
if "%choice%"=="3" (
    node -e "%SCRIPT%" premium 1
)
if "%choice%"=="4" (
    node -e "%SCRIPT%" all 5
)

echo.
echo ====================================================
echo Copy the key above and provide it to your customer.
echo ====================================================
echo.
pause
