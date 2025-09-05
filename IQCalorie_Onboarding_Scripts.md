# IQCalorie – ClickFunnels Onboarding Scripts

Each section below corresponds to a page in the ClickFunnels onboarding flow. Insert your footer script for each page under the appropriate section.

---
## 0. Main Landing Page

```html
<!-- Insert footer script for Main Landing Page -->
```
<script>
(function() {
    "use strict";
    
    console.log("📱 Final phone capture script loaded");
    
    let phoneAlreadyCaptured = false;
    
    function getSelectedCountryCode() {
        console.log("🔍 Getting selected country code...");
        
        // Method 1: Try ITI library first (most reliable)
        const phoneInput = document.querySelector('input[type="tel"]');
        if (phoneInput && window.intlTelInputGlobals) {
            try {
                const iti = window.intlTelInputGlobals.getInstance(phoneInput);
                if (iti) {
                    const countryData = iti.getSelectedCountryData();
                    if (countryData && countryData.dialCode) {
                        const code = '+' + countryData.dialCode;
                        console.log("🎯 ITI detected country code:", code);
                        return code;
                    }
                }
            } catch (e) {
                console.log("⚠️ ITI method failed:", e.message);
            }
        }
        
        // Method 2: Check for visible country flags and map to dial codes
        const selectedFlag = document.querySelector('.iti__selected-flag');
        if (selectedFlag) {
            console.log("✅ Found selected flag element");
            
            // Map flag classes to dial codes
            const flagToDialCode = {
                'iti__gb': '+44',    // United Kingdom
                'iti__us': '+1',     // United States  
                'iti__ca': '+1',     // Canada
                'iti__au': '+61',    // Australia
                'iti__fr': '+33',    // France
                'iti__de': '+49',    // Germany
                'iti__it': '+39',    // Italy
                'iti__es': '+34',    // Spain
                'iti__nl': '+31',    // Netherlands
                'iti__ch': '+41',    // Switzerland
                'iti__at': '+43',    // Austria
                'iti__be': '+32',    // Belgium
                'iti__ie': '+353',   // Ireland
                'iti__se': '+46',    // Sweden
                'iti__no': '+47',    // Norway
                'iti__dk': '+45',    // Denmark
                'iti__fi': '+358',   // Finland
                'iti__pl': '+48',    // Poland
                'iti__pt': '+351',   // Portugal
                'iti__gr': '+30',    // Greece
                'iti__jp': '+81',    // Japan
                'iti__kr': '+82',    // South Korea
                'iti__cn': '+86',    // China
                'iti__in': '+91',    // India
                'iti__br': '+55',    // Brazil
                'iti__mx': '+52',    // Mexico
                'iti__ar': '+54',    // Argentina
                'iti__cl': '+56',    // Chile
                'iti__co': '+57',    // Colombia
                'iti__pe': '+51',    // Peru
                'iti__za': '+27',    // South Africa
                'iti__eg': '+20',    // Egypt
                'iti__ng': '+234',   // Nigeria
                'iti__ke': '+254',   // Kenya
                'iti__ma': '+212',   // Morocco
                'iti__ae': '+971',   // UAE
                'iti__sa': '+966',   // Saudi Arabia
                'iti__lb': '+961',   // Lebanon
                'iti__jo': '+962',   // Jordan
                'iti__sy': '+963',   // Syria
                'iti__iq': '+964',   // Iraq
                'iti__ir': '+98',    // Iran
                'iti__tr': '+90',    // Turkey
                'iti__ru': '+7',     // Russia
                'iti__ua': '+380',   // Ukraine
                'iti__by': '+375',   // Belarus
                'iti__kz': '+7',     // Kazakhstan
                'iti__uz': '+998',   // Uzbekistan
                'iti__th': '+66',    // Thailand
                'iti__vn': '+84',    // Vietnam
                'iti__sg': '+65',    // Singapore
                'iti__my': '+60',    // Malaysia
                'iti__id': '+62',    // Indonesia
                'iti__ph': '+63',    // Philippines
                'iti__nz': '+64',    // New Zealand
            };
            
            // Check all flag classes in the selected flag area
            for (const flagClass in flagToDialCode) {
                const flagElement = selectedFlag.querySelector('.' + flagClass);
                if (flagElement && flagElement.offsetWidth > 0) {
                    const dialCode = flagToDialCode[flagClass];
                    console.log(`🎯 Found visible flag ${flagClass}, mapped to: ${dialCode}`);
                    return dialCode;
                }
            }
        }
        
        // Method 3: Look for visible dial codes not in dropdown
        const allDialCodes = document.querySelectorAll('.iti__dial-code');
        for (let i = 0; i < allDialCodes.length; i++) {
            const dialCodeEl = allDialCodes[i];
            const dialCodeText = dialCodeEl.textContent.trim();
            
            // Check if visible and not in dropdown
            if (dialCodeEl.offsetWidth > 0 && dialCodeEl.offsetHeight > 0) {
                const isInDropdown = dialCodeEl.closest('.iti__country-list');
                if (!isInDropdown) {
                    console.log("🎯 Found visible dial code outside dropdown:", dialCodeText);
                    return dialCodeText;
                }
            }
        }
        
        // Method 4: Check if phone input already has country code
        if (phoneInput && phoneInput.value.trim().startsWith('+')) {
            const match = phoneInput.value.trim().match(/^(\+\d{1,4})/);
            if (match) {
                console.log("🎯 Found country code in input value:", match[1]);
                return match[1];
            }
        }
        
        console.log("❌ Could not detect country code, using Lebanon fallback");
        return '+961';
    }
    
    function captureStartFreeTrialClick() {
        setTimeout(function() {
            const startTrialBtn = document.querySelector('#startFreeTrialBtn');
            
            if (startTrialBtn) {
                console.log("✅ Found Start Free Trial button");
                
                startTrialBtn.addEventListener('click', function(e) {
                    console.log("🚀 START FREE TRIAL CLICKED!");

                    // CAPTURE EMAIL (moved outside phone logic)
                    const emailInput = document.querySelector('input[type="email"]');
                    const emailValue = emailInput ? emailInput.value.trim() : '';

                    if (emailValue) {
                        localStorage.setItem('userEmail', emailValue);
                        console.log("📧 Email stored:", emailValue);
                    } else {
                        console.log("📧 No email found in form");
                    }  

                    if (phoneAlreadyCaptured) {
                        console.log("📱 Phone already captured, skipping...");
                        return;
                    }
                    
                    // Look for phone input in multiple places (popup, main form, etc.)
                    let phoneInput = document.querySelector('input[type="tel"]');
                    
                    // If not found, try looking in the popup specifically
                    if (!phoneInput || !phoneInput.value.trim()) {
                        const popup = document.querySelector('.popup, .modal, [class*="popup"], [class*="modal"]');
                        if (popup) {
                            phoneInput = popup.querySelector('input[type="tel"]');
                            console.log("📱 Looking for phone input in popup:", !!phoneInput);
                        }
                    }
                    
                    // Try other selectors
                    if (!phoneInput || !phoneInput.value.trim()) {
                        phoneInput = document.querySelector('input[name*="phone"], input[id*="phone"], input[placeholder*="phone"]');
                        console.log("📱 Trying alternative phone selectors:", !!phoneInput);
                    }
                    
                    console.log("📱 Phone input found:", !!phoneInput);
                    console.log("📱 Phone input value:", phoneInput ? `"${phoneInput.value}"` : "none");
                    
                    if (phoneInput && phoneInput.value.trim()) {
                        const phoneNumber = phoneInput.value.trim();
                        console.log("📱 Raw phone input:", phoneNumber);
                        
                        if (phoneNumber.startsWith('+')) {
                            // Phone already has country code
                            const fullPhoneNumber = phoneNumber.replace(/\s+/g, '');
                            console.log("📱 Phone already has country code:", fullPhoneNumber);
                            
                            localStorage.setItem('userPhone', fullPhoneNumber);
                            phoneAlreadyCaptured = true;
                            console.log("💾 STORED:", fullPhoneNumber);
                        } else {
                            // Get the selected country code
                            const countryCode = getSelectedCountryCode();
                            console.log("🌍 Using country code:", countryCode);
                            
                            // Clean phone number
                            const cleanPhone = phoneNumber.replace(/^0+/, '').replace(/\s+/g, '');
                            const fullPhoneNumber = countryCode + cleanPhone;
                            
                            console.log("🔧 Building phone number:");
                            console.log("  Original:", phoneNumber);
                            console.log("  Country code:", countryCode);
                            console.log("  Cleaned:", cleanPhone);
                            console.log("  Final:", fullPhoneNumber);
                            
                            localStorage.setItem('userPhone', fullPhoneNumber);
                            phoneAlreadyCaptured = true;
                            console.log("💾 STORED:", fullPhoneNumber);
                        }
                    } else {
                        console.log("❌ No phone value found");
                        
                        // Debug: Show all input fields to help identify the issue
                        console.log("🔍 DEBUG: All input fields on page:");
                        const allInputs = document.querySelectorAll('input');
                        allInputs.forEach((input, i) => {
                            console.log(`  ${i + 1}. Type: ${input.type}, Value: "${input.value}", Name: "${input.name}", ID: "${input.id}", Placeholder: "${input.placeholder}"`);
                        });
                        
                        // Try to find any input with a phone-like value
                        const phonePattern = /^[\d\s\-\+\(\)]+$/;
                        allInputs.forEach((input, i) => {
                            if (input.value && phonePattern.test(input.value) && input.value.length >= 8) {
                                console.log(`🎯 Found potential phone in input ${i + 1}:`, input.value);
                            }
                        });
                    }
                });
            } else {
                console.log("❌ Start Free Trial button not found");
            }
        }, 2000);
    }
    
    // Backup: Capture when any form is submitted
    function captureFormSubmission() {
        document.addEventListener('submit', function(e) {
            const form = e.target;
            if (form && form.tagName === 'FORM' && !phoneAlreadyCaptured) {
                console.log("📝 Form submitted, capturing phone number...");
                
                const phoneField = form.querySelector('input[type="tel"]');
                if (phoneField && phoneField.value.trim()) {
                    const phoneNumber = phoneField.value.trim();
                    const countryCode = getSelectedCountryCode();
                    const fullPhoneNumber = phoneNumber.startsWith('+') ? phoneNumber : countryCode + phoneNumber.replace(/^0+/, '');
                    
                    localStorage.setItem('userPhone', fullPhoneNumber);
                    phoneAlreadyCaptured = true;
                    console.log("💾 STORED from form:", fullPhoneNumber);
                }
            }
        });
    }
    
    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            captureStartFreeTrialClick();
            captureFormSubmission();
        });
    } else {
        captureStartFreeTrialClick();
        captureFormSubmission();
    }
    
    // Test functions
    window.testCountryCodeFinal = function() {
        console.log("🧪 Testing final country code detection:");
        const code = getSelectedCountryCode();
        console.log("Result:", code);
        return code;
    };
    
    window.clearPhoneCapture = function() {
        localStorage.removeItem('userPhone');
        phoneAlreadyCaptured = false;
        console.log("🗑️ Phone capture cleared");
    };
    
    console.log("🧪 Final test functions available:");
    console.log("  window.testCountryCodeFinal() - Test detection");
    console.log("  window.clearPhoneCapture() - Clear stored phone");
    
})();
</script>

<!-- Insert HEADER script for Main Landing Page -->

<script>
// Clear all localStorage when landing page loads
localStorage.clear();
console.log('Landing page loaded - localStorage cleared');
</script>

## 1. Gender Selection

![1_gender_selection_clickfunnels.png](1_gender_selection_clickfunnels.png)

```html
<!-- Insert footer script for Gender Selection -->
```

<script>
// Gender Selection UI Code
//desktop  
  document.addEventListener("DOMContentLoaded", function () {
    const maleBtn = document.querySelector("#male-btn-desk");
    const femaleBtn = document.querySelector("#female-btn-desk");
    const nextBtn = document.querySelector("#next-btn-desk");

    if (maleBtn) {
      maleBtn.addEventListener("click", function () {
        nextBtn.style.opacity = "1";
        // Store gender selection
        localStorage.setItem('gender', 'male');
        console.log('Gender stored: male');
      });
    }

    if (femaleBtn) {
      femaleBtn.addEventListener("click", function () {
        nextBtn.style.opacity = "1";
        // Store gender selection
        localStorage.setItem('gender', 'female');
        console.log('Gender stored: female');
      });
    }
  });
</script>

<script>
//mobile  
  document.addEventListener("DOMContentLoaded", function () {
    const maleBtn = document.querySelector("#male-btn-mob");
    const femaleBtn = document.querySelector("#female-btn-mob");
    const nextBtn = document.querySelector("#next-btn-mob");

    if (maleBtn) {
      maleBtn.addEventListener("click", function () {
        nextBtn.style.opacity = "1";
        // Store gender selection
        localStorage.setItem('gender', 'male');
        console.log('Gender stored: male');
      });
    }

    if (femaleBtn) {
      femaleBtn.addEventListener("click", function () {
        nextBtn.style.opacity = "1";
        // Store gender selection
        localStorage.setItem('gender', 'male');
        console.log('Gender stored: female');
      });
    }
  });
</script>

<!-- Insert HEADER script for Gender Selection  -->
<script>
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('preview') === 'true') {
  console.log('Edit mode - bypassing protection');
} else if (!document.referrer.includes('iqcalorie.com')) {
  window.location.replace('https://www.iqcalorie.com/landing');
}
</script>

---

## 2. Measurement System

![2_measurement_system_clickfunnels.png](2_measurement_system_clickfunnels.png)

```html
<!-- Insert footer script for Measurement System -->
```
<script>
// Preferred Measurement System UX Code 
//desktop  
  document.addEventListener("DOMContentLoaded", function () {
    const metricBtn = document.querySelector("#metricBtn-desk");
    const imperialBtn = document.querySelector("#imperialBtn-desk");
    const nextBtn = document.querySelector("#next-btn-desk-21");
    

    if (metricBtn) {
      metricBtn.addEventListener("click", function () { 
        nextBtn.style.opacity = "1";
      });
    }

    if (imperialBtn) {
      imperialBtn.addEventListener("click", function () {
        nextBtn.style.opacity = "1";
      });
    }
  });
</script>

 

<script>
//mobile  
  document.addEventListener("DOMContentLoaded", function () {
    const metricBtn = document.querySelector("#metricBtn-mob");
    const imperialBtn = document.querySelector("#imperialBtn-mob");
    const nextBtn = document.querySelector("#next-btn-mob-2");

    if (metricBtn) {
      metricBtn.addEventListener("click", function () {
        nextBtn.style.opacity = "1";
      });
    }

    if (imperialBtn) {
      imperialBtn.addEventListener("click", function () {
        nextBtn.style.opacity = "1";
      });
    }
  });
</script>


<script>
// Metric/Imperial Decision Local Storage
//desktop  
  document.addEventListener("DOMContentLoaded", function () {
    const metricBtn = document.querySelector("#metricBtn-desk");
    const imperialBtn = document.querySelector("#imperialBtn-desk");

    if (metricBtn) {
      metricBtn.addEventListener("click", function () {
        localStorage.setItem("preferredSystem", "metric");
      });
    }

    if (imperialBtn) {
      imperialBtn.addEventListener("click", function () {
        localStorage.setItem("preferredSystem", "imperial");
      });
    }
  });
</script>


<script>
//mobile  
  document.addEventListener("DOMContentLoaded", function () {
    const metricBtn = document.querySelector("#metricBtn-mob");
    const imperialBtn = document.querySelector("#imperialBtn-mob");

    if (metricBtn) {
      metricBtn.addEventListener("click", function () {
        localStorage.setItem("preferredSystem", "metric");
      });
    }

    if (imperialBtn) {
      imperialBtn.addEventListener("click", function () {
        localStorage.setItem("preferredSystem", "imperial");
      });
    }
  });
</script>


---
```html
<!-- Insert HEADER script for Measurement System -->
```
<script>
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('preview') === 'true') {
  console.log('Edit mode - bypassing protection');
} else if (!localStorage.getItem('gender') || !document.referrer.includes('iqcalorie.com')) {
  window.location.replace('https://www.iqcalorie.com/landing');
}
</script>




## 3. Height Input

![3_height_clickfunnels.png](3_height_clickfunnels.png)

```html
<!-- Insert footer script for Height -->
```<script>
// Hide metric row vs imperial row logic
  
  document.addEventListener("DOMContentLoaded", function () {
    const metricRow = document.querySelector("#metricHeightRow");
    const imperialRow = document.querySelector("#imperialHeightRow");

    const system = localStorage.getItem("preferredSystem");

    if (system === "metric") {
      metricRow.style.display = "block";
    } else if (system === "imperial") {
      imperialRow.style.display = "block";
    }
  });
</script>


<script>
// Complete ClickFunnels Validation Script
console.log("Height validation script loading...");

// Prevent multiple executions
if (window.heightValidationLoaded) {
  console.log("Script already loaded, skipping...");
} else {
  window.heightValidationLoaded = true;
  
  setTimeout(() => {
    console.log("Starting height validation setup...");
    
    // Get system preference
    let system = null;
    try {
      system = localStorage.getItem("preferredSystem");
      console.log("System preference:", system);
    } catch (e) {
      console.log("Could not access localStorage");
    }
    
    // Find the buttons (desktop and mobile)
    const nextBtnDesktop = document.querySelector("#next-btn-desk-3");
    const nextBtnMobile = document.querySelector("#next-btn-mob-3");
    
    console.log("Desktop button found:", !!nextBtnDesktop);
    console.log("Mobile button found:", !!nextBtnMobile);
    
    // Style BOTH buttons if they exist
    const buttonsToStyle = [];
    if (nextBtnDesktop) buttonsToStyle.push({btn: nextBtnDesktop, type: "desktop"});
    if (nextBtnMobile) buttonsToStyle.push({btn: nextBtnMobile, type: "mobile"});
    
    console.log("Buttons to style:", buttonsToStyle.map(b => b.type));
    
    if (buttonsToStyle.length === 0) {
      console.log("No buttons found - stopping");
      return;
    }
    
    // Enhanced enable/disable functions for ALL buttons
    function enableButton() {
      console.log("🟢 ENABLING BUTTONS:", buttonsToStyle.map(b => b.type));
      
      buttonsToStyle.forEach(({btn, type}) => {
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
        btn.classList.remove("disabled-btn");
        
        // More aggressive styling to override ClickFunnels
        btn.style.backgroundColor = "";
        btn.style.cursor = "pointer";
        btn.style.filter = "none";
        btn.style.setProperty("opacity", "1", "important");
        
        console.log(`  ✅ ${type} button enabled`);
      });
    }
    
    function disableButton() {
      console.log("🔴 DISABLING BUTTONS:", buttonsToStyle.map(b => b.type));
      
      buttonsToStyle.forEach(({btn, type}) => {
        btn.style.opacity = "0.5";
        btn.style.pointerEvents = "none";
        btn.classList.add("disabled-btn");
        
        // Keep the orange color, just make it transparent
        btn.style.cursor = "not-allowed";
        btn.style.filter = "none"; // Remove grayscale to keep orange color
        btn.style.setProperty("opacity", "0.5", "important");
        
        console.log(`  ❌ ${type} button disabled`);
      });
    }
    
    // Start disabled
    disableButton();
    
    // Make functions available for testing
    window.testEnable = enableButton;
    window.testDisable = disableButton;
    
    // Handle metric system
    if (system === "metric") {
      const input = document.querySelector("#cm-input");
      const errorMsg = document.querySelector("#metric-height-error");
      let validationTimeout;
      
      if (input) {
        console.log("Setting up metric validation with delay");
        console.log("Error message element found:", !!errorMsg);
        
        input.addEventListener("input", (event) => {
          clearTimeout(validationTimeout);
          
          const actualValue = event.target.value || input.value || '';
          const val = parseFloat(actualValue);
          
          if (actualValue.trim() === '') {
            console.log("Empty field - hiding error, disabling button");
            disableButton();
            if (errorMsg) {
              errorMsg.style.display = "none";
            }
            return;
          }
          
          if (!isNaN(val) && val >= 100 && val <= 250) {
            console.log("Valid input - immediate enable:", actualValue);
            enableButton();
            
            // Store height value
  			localStorage.setItem('height', actualValue);
  			console.log('Height stored (cm):', actualValue);
            
            if (errorMsg) {
              errorMsg.style.display = "none";
            }
          } else {
            console.log("Potentially invalid input, waiting before validation:", actualValue);
            disableButton();
            
            validationTimeout = setTimeout(() => {
              const currentValue = event.target.value || input.value || '';
              const currentVal = parseFloat(currentValue);
              
              if (currentValue.trim() !== '' && (isNaN(currentVal) || currentVal < 100 || currentVal > 250)) {
                console.log("Confirmed invalid after delay - showing error");
                if (errorMsg) {
                  errorMsg.style.display = "block";
                }
              }
            }, 800);
          }
        });
      } else {
        console.log("Metric input field not found!");
      }
    }
    
    // Handle imperial system  
    if (system === "imperial") {
      const feetInput = document.querySelector("#ft-input");
      const inchInput = document.querySelector("#in-input");
      const errorMsg = document.querySelector("#imperial-height-error");
      let validationTimeout;
      let currentFeetValue = '';
      let currentInchValue = '';
      
      if (feetInput && inchInput) {
        console.log("Setting up imperial validation");
        
        function checkImperialHeight() {
          console.log("🔥 IMPERIAL VALIDATION FUNCTION START 🔥");
          console.log("Input variables:");
          console.log("  - currentFeetValue (string):", `"${currentFeetValue}"`);
          console.log("  - currentInchValue (string):", `"${currentInchValue}"`);
          
          const feet = parseFloat(currentFeetValue) || 0;
          const inches = parseFloat(currentInchValue) || 0;
          const totalInches = (feet * 12) + inches;
          
          console.log("Parsed values:");
          console.log("  - feet (number):", feet);
          console.log("  - inches (number):", inches);
          console.log("  - totalInches:", totalInches);
          
          console.log("Individual validation checks:");
          const isEmpty = currentFeetValue.trim() === '' && currentInchValue.trim() === '';
          const feetValid = feet >= 3 && feet <= 8;
          const inchValid = inches >= 0 && inches < 12;
          const totalValid = totalInches >= 36 && totalInches <= 96;
          
          console.log("  - isEmpty:", isEmpty, `(feetValue: "${currentFeetValue.trim()}", inchValue: "${currentInchValue.trim()}")`);
          console.log("  - feetValid (3-8):", feetValid, `(${feet} >= 3 && ${feet} <= 8)`);
          console.log("  - inchValid (0-11):", inchValid, `(${inches} >= 0 && ${inches} < 12)`);
          console.log("  - totalValid (36-96):", totalValid, `(${totalInches} >= 36 && ${totalInches} <= 96)`);
          
          const overallValid = feetValid && inchValid && totalValid;
          console.log("  - overallValid:", overallValid, `(${feetValid} && ${inchValid} && ${totalValid})`);
          
          if (isEmpty) {
            console.log("🟡 EMPTY FIELDS - Disabling button, hiding error");
            disableButton();
            if (errorMsg) {
              errorMsg.style.display = "none";
              console.log("   ✅ Error message hidden");
            }
            return;
          }
          
          if (overallValid) {
            console.log("🟢 VALID HEIGHT - Enabling button, hiding error");
            console.log(`   Valid: ${feet}ft ${inches}in = ${totalInches} total inches`);
            enableButton();
            
            // Store height value (total inches)
  			localStorage.setItem('height', totalInches);
  			console.log('Height stored (total inches):', totalInches);
            
            if (errorMsg) {
              errorMsg.style.display = "none";
              console.log("   ✅ Error message hidden");
            }
          } else {
            console.log("🔴 INVALID HEIGHT - Disabling button, will show error after delay");
            console.log(`   Invalid: ${feet}ft ${inches}in = ${totalInches} total inches`);
            console.log(`   Failed checks: feet(${feetValid}), inches(${inchValid}), total(${totalValid})`);
            disableButton();
            validationTimeout = setTimeout(() => {
              console.log("⏰ TIMEOUT REACHED - Showing error message");
              if (currentFeetValue.trim() !== '' || currentInchValue.trim() !== '') {
                if (errorMsg) {
                  errorMsg.style.display = "block";
                  console.log("   💀 Error message displayed");
                } else {
                  console.log("   ❌ Error message element not found!");
                }
              }
            }, 800);
          }
          console.log("🔥 IMPERIAL VALIDATION FUNCTION END 🔥\n");
        }
        
        feetInput.addEventListener("input", (event) => {
          console.log("🚨 FEET INPUT DEBUG START 🚨");
          console.log("Raw event.target.value:", `"${event.target.value}"`);
          
          clearTimeout(validationTimeout);
          currentFeetValue = event.target.value || '';
          
          console.log("Stored currentFeetValue:", `"${currentFeetValue}"`);
          console.log("Before other field check - currentInchValue:", `"${currentInchValue}"`);
          
          if (!currentInchValue) {
            const otherFieldValue = inchInput.value || '';
            console.log("Other field (inches) value found:", `"${otherFieldValue}"`);
            if (otherFieldValue) {
              currentInchValue = otherFieldValue;
              console.log("Updated currentInchValue to:", `"${currentInchValue}"`);
            }
          }
          
          console.log("Final values before validation:");
          console.log("  - currentFeetValue:", `"${currentFeetValue}"`);
          console.log("  - currentInchValue:", `"${currentInchValue}"`);
          
          setTimeout(() => {
            console.log("🚨 CALLING checkImperialHeight from FEET input 🚨");
            checkImperialHeight();
          }, 10);
        });
        
        inchInput.addEventListener("input", (event) => {
          console.log("🚨 INCH INPUT DEBUG START 🚨");
          console.log("Raw event.target.value:", `"${event.target.value}"`);
          
          clearTimeout(validationTimeout);
          currentInchValue = event.target.value || '';
          
          console.log("Stored currentInchValue:", `"${currentInchValue}"`);
          console.log("Before other field check - currentFeetValue:", `"${currentFeetValue}"`);
          
          if (!currentFeetValue) {
            const otherFieldValue = feetInput.value || '';
            console.log("Other field (feet) value found:", `"${otherFieldValue}"`);
            if (otherFieldValue) {
              currentFeetValue = otherFieldValue;
              console.log("Updated currentFeetValue to:", `"${currentFeetValue}"`);
            }
          }
          
          console.log("Final values before validation:");
          console.log("  - currentFeetValue:", `"${currentFeetValue}"`);
          console.log("  - currentInchValue:", `"${currentInchValue}"`);
          
          setTimeout(() => {
            console.log("🚨 CALLING checkImperialHeight from INCH input 🚨");
            checkImperialHeight();
          }, 10);
        });
        
        checkImperialHeight();
      } else {
        console.log("Imperial input fields not found!");
      }
    }
    
    console.log("Height validation setup complete!");
    
  }, 500);
}
</script>



<!-- Insert HEADER script for Height -->
<script>
// Check for bypass parameter first
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('preview') === 'true') {
  // Skip protection for editing
  console.log('Edit mode - bypassing protection');
} else if (!localStorage.getItem('preferredSystem') || !document.referrer.includes('iqcalorie.com')) {
  window.location.replace('https://www.iqcalorie.com/landing');
}
</script>



---

## 4. Weight Input

![4_weight_clickfunnels.png](4_weight_clickfunnels.png)

```html
<!-- Insert footer script for Weight -->
```
<script>
// Hide metric row vs imperial row logic
  
  document.addEventListener("DOMContentLoaded", function () {
    const metricRow = document.querySelector("#metricWeightRow");
    const imperialRow = document.querySelector("#imperialWeightRow");

    const system = localStorage.getItem("preferredSystem");

    if (system === "metric") {
      metricRow.style.display = "block";
    } else if (system === "imperial") {
      imperialRow.style.display = "block";
    }
  });
</script>

<script>
// Complete ClickFunnels Weight Validation Script
console.log("Weight validation script loading...");

// Prevent multiple executions
if (window.weightValidationLoaded) {Sto
  console.log("Script already loaded, skipping...");
} else {
  window.weightValidationLoaded = true;
  
  setTimeout(() => {
    console.log("Starting weight validation setup...");
    
    // Get system preference
    let system = null;
    try {
      system = localStorage.getItem("preferredSystem");
      console.log("System preference:", system);
    } catch (e) {
      console.log("Could not access localStorage");
    }
    
    // Find the buttons (desktop and mobile)
    const nextBtnDesktop = document.querySelector("#next-btn-desk-4");
    const nextBtnMobile = document.querySelector("#next-btn-mob-4");
    
    console.log("Desktop button found:", !!nextBtnDesktop);
    console.log("Mobile button found:", !!nextBtnMobile);
    
    // Style BOTH buttons if they exist
    const buttonsToStyle = [];
    if (nextBtnDesktop) buttonsToStyle.push({btn: nextBtnDesktop, type: "desktop"});
    if (nextBtnMobile) buttonsToStyle.push({btn: nextBtnMobile, type: "mobile"});
    
    console.log("Buttons to style:", buttonsToStyle.map(b => b.type));
    
    if (buttonsToStyle.length === 0) {
      console.log("No buttons found - stopping");
      return;
    }
    
    // Enhanced enable/disable functions for ALL buttons
    function enableButton() {
      console.log("🟢 ENABLING BUTTONS:", buttonsToStyle.map(b => b.type));
      
      buttonsToStyle.forEach(({btn, type}) => {
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
        btn.classList.remove("disabled-btn");
        
        // More aggressive styling to override ClickFunnels
        btn.style.backgroundColor = "";
        btn.style.cursor = "pointer";
        btn.style.filter = "none";
        btn.style.setProperty("opacity", "1", "important");
        
        console.log(`  ✅ ${type} button enabled`);
      });
    }
    
    function disableButton() {
      console.log("🔴 DISABLING BUTTONS:", buttonsToStyle.map(b => b.type));
      
      buttonsToStyle.forEach(({btn, type}) => {
        btn.style.opacity = "0.5";
        btn.style.pointerEvents = "none";
        btn.classList.add("disabled-btn");
        
        // Keep the orange color, just make it transparent
        btn.style.cursor = "not-allowed";
        btn.style.filter = "none"; // Remove grayscale to keep orange color
        btn.style.setProperty("opacity", "0.5", "important");
        
        console.log(`  ❌ ${type} button disabled`);
      });
    }
    
    // Start disabled
    disableButton();
    
    // Make functions available for testing
    window.testEnable = enableButton;
    window.testDisable = disableButton;
    
    // Handle metric system (kilograms)
    if (system === "metric") {
      const input = document.querySelector("#kg-input");
      const errorMsg = document.querySelector("#metric-weight-error");
      let validationTimeout;
      
      if (input) {
        console.log("Setting up metric weight validation with delay");
        console.log("Error message element found:", !!errorMsg);
        
        input.addEventListener("input", (event) => {
          clearTimeout(validationTimeout);
          
          const actualValue = event.target.value || input.value || '';
          const val = parseFloat(actualValue);
          
          if (actualValue.trim() === '') {
            console.log("Empty field - hiding error, disabling button");
            disableButton();
            if (errorMsg) {
              errorMsg.style.display = "none";
            }
            return;
          }
          
          if (!isNaN(val) && val >= 30 && val <= 300) {
            console.log("Valid weight input - immediate enable:", actualValue);
            enableButton();
            
            // Store weight value
  			localStorage.setItem('weight', actualValue);
  			console.log('Weight stored (kg):', actualValue);
            
            if (errorMsg) {
              errorMsg.style.display = "none";
            }
          } else {
            console.log("Potentially invalid weight input, waiting before validation:", actualValue);
            disableButton();
            
            validationTimeout = setTimeout(() => {
              const currentValue = event.target.value || input.value || '';
              const currentVal = parseFloat(currentValue);
              
              if (currentValue.trim() !== '' && (isNaN(currentVal) || currentVal < 30 || currentVal > 300)) {
                console.log("Confirmed invalid weight after delay - showing error");
                if (errorMsg) {
                  errorMsg.style.display = "block";
                }
              }
            }, 800);
          }
        });
      } else {
        console.log("Metric weight input field not found!");
      }
    }
    
    // Handle imperial system (pounds)
    if (system === "imperial") {
      const input = document.querySelector("#lbs-input");
      const errorMsg = document.querySelector("#imperial-weight-error");
      let validationTimeout;
      
      if (input) {
        console.log("Setting up imperial weight validation with delay");
        console.log("Error message element found:", !!errorMsg);
        
        input.addEventListener("input", (event) => {
          clearTimeout(validationTimeout);
          
          const actualValue = event.target.value || input.value || '';
          const val = parseFloat(actualValue);
          
          if (actualValue.trim() === '') {
            console.log("Empty field - hiding error, disabling button");
            disableButton();
            if (errorMsg) {
              errorMsg.style.display = "none";
            }
            return;
          }
          
          if (!isNaN(val) && val >= 66 && val <= 660) {
            console.log("Valid weight input - immediate enable:", actualValue);
            enableButton();
            
            // Store weight value
  			localStorage.setItem('weight', actualValue);
  			console.log('Weight stored (lbs):', actualValue);
            
            if (errorMsg) {
              errorMsg.style.display = "none";
            }
          } else {
            console.log("Potentially invalid weight input, waiting before validation:", actualValue);
            disableButton();
            
            validationTimeout = setTimeout(() => {
              const currentValue = event.target.value || input.value || '';
              const currentVal = parseFloat(currentValue);
              
              if (currentValue.trim() !== '' && (isNaN(currentVal) || currentVal < 66 || currentVal > 660)) {
                console.log("Confirmed invalid weight after delay - showing error");
                if (errorMsg) {
                  errorMsg.style.display = "block";
                }
              }
            }, 800);
          }
        });
      } else {
        console.log("Imperial weight input field not found!");
      }
    }
    
    console.log("Weight validation setup complete!");
    
  }, 500);
}
</script>

<!-- Insert HEADER script for Weight -->
<script>
// Check for bypass parameter first
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('preview') === 'true') {
  // Skip protection for editing
  console.log('Edit mode - bypassing protection');
} else if (!localStorage.getItem('height') || !document.referrer.includes('iqcalorie.com')) {
  window.location.replace('https://www.iqcalorie.com/landing');
}
</script>
---

## 5. Age Input

![5_age_clickfunnels.png](5_age_clickfunnels.png)

```html
<!-- Insert footer script for Age -->
```
<script>
// Complete ClickFunnels Age Validation Script
console.log("Age validation script loading...");

// Prevent multiple executions
if (window.ageValidationLoaded) {
  console.log("Script already loaded, skipping...");
} else {
  window.ageValidationLoaded = true;
  
  setTimeout(() => {
    console.log("Starting age validation setup...");
    
    // Find the buttons (desktop and mobile)
    const nextBtnDesktop = document.querySelector("#next-btn-desk-5");
    const nextBtnMobile = document.querySelector("#next-btn-mob-5");
    
    console.log("Desktop button found:", !!nextBtnDesktop);
    console.log("Mobile button found:", !!nextBtnMobile);
    
    // Style BOTH buttons if they exist
    const buttonsToStyle = [];
    if (nextBtnDesktop) buttonsToStyle.push({btn: nextBtnDesktop, type: "desktop"});
    if (nextBtnMobile) buttonsToStyle.push({btn: nextBtnMobile, type: "mobile"});
    
    console.log("Buttons to style:", buttonsToStyle.map(b => b.type));
    
    if (buttonsToStyle.length === 0) {
      console.log("No buttons found - stopping");
      return;
    }
    
    // Enhanced enable/disable functions for ALL buttons
    function enableButton() {
      console.log("🟢 ENABLING BUTTONS:", buttonsToStyle.map(b => b.type));
      
      buttonsToStyle.forEach(({btn, type}) => {
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
        btn.classList.remove("disabled-btn");
        
        // More aggressive styling to override ClickFunnels
        btn.style.backgroundColor = "";
        btn.style.cursor = "pointer";
        btn.style.filter = "none";
        btn.style.setProperty("opacity", "1", "important");
        
        console.log(`  ✅ ${type} button enabled`);
      });
    }
    
    function disableButton() {
      console.log("🔴 DISABLING BUTTONS:", buttonsToStyle.map(b => b.type));
      
      buttonsToStyle.forEach(({btn, type}) => {
        btn.style.opacity = "0.5";
        btn.style.pointerEvents = "none";
        btn.classList.add("disabled-btn");
        
        // Keep the orange color, just make it transparent
        btn.style.cursor = "not-allowed";
        btn.style.filter = "none"; // Remove grayscale to keep orange color
        btn.style.setProperty("opacity", "0.5", "important");
        
        console.log(`  ❌ ${type} button disabled`);
      });
    }
    
    // Start disabled
    disableButton();
    
    // Make functions available for testing
    window.testEnable = enableButton;
    window.testDisable = disableButton;
    
    // Handle age validation
    const input = document.querySelector("#years-input");
    const errorMsg = document.querySelector("#age-error");
    let validationTimeout;
    
    if (input) {
      console.log("Setting up age validation with delay");
      console.log("Error message element found:", !!errorMsg);
      
      input.addEventListener("input", (event) => {
        clearTimeout(validationTimeout);
        
        const actualValue = event.target.value || input.value || '';
        const val = parseInt(actualValue);
        
        if (actualValue.trim() === '') {
          console.log("Empty field - hiding error, disabling button");
          disableButton();
          if (errorMsg) {
            errorMsg.style.display = "none";
          }
          return;
        }
        
        if (!isNaN(val) && val >= 16 && val <= 100) {
          console.log("Valid age input - immediate enable:", actualValue);
          enableButton();
          
          // Store age value
  		  localStorage.setItem('age', actualValue);
  		  console.log('Age stored:', actualValue);
          
          if (errorMsg) {
            errorMsg.style.display = "none";
          }
        } else {
          console.log("Potentially invalid age input, waiting before validation:", actualValue);
          disableButton();
          
          validationTimeout = setTimeout(() => {
            const currentValue = event.target.value || input.value || '';
            const currentVal = parseInt(currentValue);
            
            if (currentValue.trim() !== '' && (isNaN(currentVal) || currentVal < 16 || currentVal > 100)) {
              console.log("Confirmed invalid age after delay - showing error");
              if (errorMsg) {
                errorMsg.style.display = "block";
              }
            }
          }, 265);
        }
      });
    } else {
      console.log("Age input field not found!");
    }
    
    console.log("Age validation setup complete!");
    
  }, 500);
}
</script>


<!-- Insert HEADER script for Age -->
<script>
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('preview') === 'true') {
  console.log('Edit mode - bypassing protection');
} else if (!localStorage.getItem('weight') || !document.referrer.includes('iqcalorie.com')) {
  window.location.replace('https://www.iqcalorie.com/landing');
}
</script>
---

## 6. Primary Fitness Goal

![6_primary_fitness_goal_clickfunnels.png](6_primary_fitness_goal_clickfunnels.png)

```html
<!-- Insert footer script for Primary Fitness Goal -->
```
<script>
// Primary Fitness Goal Selection UI Code
// Desktop
document.addEventListener("DOMContentLoaded", function () {
  const loseWeightRow = document.querySelector("#loseWeightRow");
  const maintainWeightRow = document.querySelector("#maintainWeightRow");
  const gainWeightRow = document.querySelector("#gainWeightRow");
  const nextBtn = document.querySelector("#next-btn-desk-6");
  
  const options = [loseWeightRow, maintainWeightRow, gainWeightRow];
  
  // Start with transparent next button
  if (nextBtn) {
    nextBtn.style.opacity = "0.5";
  }
  
  // Add hover and click styles to all option cards
  options.forEach(function(option) {
    if (option) {
      // Set cursor pointer
      option.style.cursor = "pointer";
      
      // Hover effect
      option.addEventListener("mouseenter", function() {
        this.style.backgroundColor = "rgba(255, 102, 0, 0.05)"; // Very transparent orange
        this.style.border = "2px solid #ff6600"; // Orange solid border
      });
      
      // Remove hover effect
      option.addEventListener("mouseleave", function() {
        // Only reset if not selected
        if (!this.classList.contains("selected")) {
          this.style.backgroundColor = "";
          this.style.border = "";
        }
      });
      
      // Click effect
      option.addEventListener("click", function() {
        // Remove selected class from all options
        options.forEach(function(opt) {
          if (opt) {
            opt.classList.remove("selected");
            opt.style.backgroundColor = "";
            opt.style.border = "";
          }
        });
        
        // Add selected styles to clicked option
        this.classList.add("selected");
        this.style.backgroundColor = "rgba(255, 102, 0, 0.1)"; // Slightly less transparent orange
        this.style.border = "2px solid #ff6600"; // Orange solid border
        
        // Store fitness goal based on which option was clicked
        if (this === loseWeightRow) {
          localStorage.setItem('fitnessGoal', 'lose_weight');
          console.log('Fitness goal stored: lose_weight');
        } else if (this === maintainWeightRow) {
          localStorage.setItem('fitnessGoal', 'maintain_build');
          console.log('Fitness goal stored: maintain_build');
        } else if (this === gainWeightRow) {
          localStorage.setItem('fitnessGoal', 'gain_weight');
          console.log('Fitness goal stored: gain_weight');
        }
        
        if (nextBtn) {
          nextBtn.style.opacity = "1";
        }
        
        // Redirect to next step immediately
        window.location.href = "https://josephselwansteamwo4bf45.myclickfunnels.com/activity-level";
      });
    }
  });
});
</script>

<script>
// Mobile
document.addEventListener("DOMContentLoaded", function () {
  const loseWeightRow = document.querySelector("#loseWeightRow");
  const maintainWeightRow = document.querySelector("#maintainWeightRow");
  const gainWeightRow = document.querySelector("#gainWeightRow");
  const nextBtn = document.querySelector("#next-btn-mob-6");
  
  const options = [loseWeightRow, maintainWeightRow, gainWeightRow];
  
  // Start with transparent next button
  if (nextBtn) {
    nextBtn.style.opacity = "0.5";
  }
  
  // Add touch and click styles to all option cards
  options.forEach(function(option) {
    if (option) {
      // Set cursor pointer (for mobile browsers that support it)
      option.style.cursor = "pointer";
      
      // Touch/click effect for mobile
      option.addEventListener("touchstart", function() {
        this.style.backgroundColor = "rgba(255, 102, 0, 0.05)"; // Very transparent orange
        this.style.border = "2px solid #ff6600"; // Orange solid border
      });
      
      // Click effect
      option.addEventListener("click", function() {
        // Remove selected class from all options
        options.forEach(function(opt) {
          if (opt) {
            opt.classList.remove("selected");
            opt.style.backgroundColor = "";
            opt.style.border = "";
          }
        });
        
        // Add selected styles to clicked option
        this.classList.add("selected");
        this.style.backgroundColor = "rgba(255, 102, 0, 0.1)"; // Slightly less transparent orange
        this.style.border = "2px solid #ff6600"; // Orange solid border
        
        // Store fitness goal based on which option was clicked
        if (this === loseWeightRow) {
          localStorage.setItem('fitnessGoal', 'lose_weight');
          console.log('Fitness goal stored: lose_weight');
        } else if (this === maintainWeightRow) {
          localStorage.setItem('fitnessGoal', 'maintain_build');
          console.log('Fitness goal stored: maintain_build');
        } else if (this === gainWeightRow) {
          localStorage.setItem('fitnessGoal', 'gain_weight');
          console.log('Fitness goal stored: gain_weight');
        }
        
        if (nextBtn) {
          nextBtn.style.opacity = "1";
        }
        
        // Redirect to next step immediately
        window.location.href = "https://josephselwansteamwo4bf45.myclickfunnels.com/activity-level";
      });
    }
  });
});
</script>

<!-- Insert HEADER script for Primary Fitness Goal -->
<script>
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('preview') === 'true') {
  console.log('Edit mode - bypassing protection');
} else if (!localStorage.getItem('age') || !document.referrer.includes('iqcalorie.com')) {
  window.location.replace('https://www.iqcalorie.com/landing');
}
</script>


---

## 7. Activity Level

![7_activity_level_clickfunnels.png](7_activity_level_clickfunnels.png)

```html
<!-- Insert footer script for Activity Level -->
```

<script>
(function() {
    "use strict";
    
    function initActivityLevel() {
        console.log("Activity Level page loading...");
        
        var options = [
            { id: "#notVeryActiveRow", value: "not_very_active" },
            { id: "#lightlyActiveRow", value: "lightly_active" },
            { id: "#activeRow", value: "active" },
            { id: "#veryActiveRow", value: "very_active" },
            { id: "#highIntensityRow", value: "high_intensity" }
        ];
        
        var nextBtnDesktop = document.querySelector("#next-btn-desk-7");
        var nextBtnMobile = document.querySelector("#next-btn-mob-7");
        
        // Set initial button state
        if (nextBtnDesktop) nextBtnDesktop.style.opacity = "0.5";
        if (nextBtnMobile) nextBtnMobile.style.opacity = "0.5";
        
        function handleSelection(selectedValue) {
            console.log("Activity level selected:", selectedValue);
            
            try {
                localStorage.setItem("activityLevel", selectedValue);
            } catch (e) {
                console.error("Storage failed:", e);
            }
            
            if (nextBtnDesktop) nextBtnDesktop.style.opacity = "1";
            if (nextBtnMobile) nextBtnMobile.style.opacity = "1";
            
            setTimeout(function() {
                window.location.href = "https://josephselwansteamwo4bf45.myclickfunnels.com/calculating-results";
            }, 200);
        }
        
        // Add click handlers
        options.forEach(function(option) {
            var element = document.querySelector(option.id);
            if (element) {
                element.style.cursor = "pointer";
                
                element.addEventListener("click", function() {
                    // Remove selection from all options
                    options.forEach(function(opt) {
                        var el = document.querySelector(opt.id);
                        if (el) {
                            el.classList.remove("selected");
                            el.style.backgroundColor = "";
                            el.style.border = "";
                        }
                    });
                    
                    // Add selection to clicked option
                    this.classList.add("selected");
                    this.style.backgroundColor = "rgba(255, 102, 0, 0.1)";
                    this.style.border = "2px solid #ff6600";
                    
                    handleSelection(option.value);
                });
                
                // Add hover effects
                element.addEventListener("mouseenter", function() {
                    if (!this.classList.contains("selected")) {
                        this.style.backgroundColor = "rgba(255, 102, 0, 0.05)";
                        this.style.border = "2px solid #ff6600";
                    }
                });
                
                element.addEventListener("mouseleave", function() {
                    if (!this.classList.contains("selected")) {
                        this.style.backgroundColor = "";
                        this.style.border = "";
                    }
                });
            }
        });
        
        console.log("Activity Level setup complete");
    }
    
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initActivityLevel);
    } else {
        initActivityLevel();
    }
})();
</script>


<!-- Insert HEADER script for Activity Level -->
<script>
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('preview') === 'true') {
  console.log('Edit mode - bypassing protection');
} else if (!localStorage.getItem('fitnessGoal') || !document.referrer.includes('iqcalorie.com')) {
  window.location.replace('https://www.iqcalorie.com/landing');
}
</script>


---

## 8. Calculating Results (Loading Page)

![8_calculating_results_clickfunnels.png](8_calculating_results_clickfunnels.png)

```html
<!-- Insert footer script for Calculating Results -->
<script>
(function() {
    "use strict";
    
    console.log("Loading page started...");
    
    function redirectToResults() {
        try {
            console.log("Redirecting to results page...");
            window.location.href = "https://josephselwansteamwo4bf45.myclickfunnels.com/your-results";
        } catch (e) {
            console.error("Redirect failed:", e);
            setTimeout(function() {
                window.location.href = "https://josephselwansteamwo4bf45.myclickfunnels.com/your-results";
            }, 100);
        }
    }
    
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function() {
            setTimeout(redirectToResults, 1600);
        });
    } else {
        setTimeout(redirectToResults, 1600);
    }
})();
</script>
---

## 9. Results Display

![9_results_clickfunnels.png](9_results_clickfunnels.png)

```html
<!-- Insert footer script for Results Display -->
```
<script>
// TDEE Calculation Script
document.addEventListener("DOMContentLoaded", function() {
    console.log("🔥 STARTING TDEE CALCULATION 🔥");
    
    // Get all stored user data
    let userData = {
        gender: localStorage.getItem('gender') || 'male',
        age: parseInt(localStorage.getItem('age')) || 25,
        height: parseFloat(localStorage.getItem('height')) || 175,
        weight: parseFloat(localStorage.getItem('weight')) || 70,
        activityLevel: localStorage.getItem('activityLevel') || 'active',
        fitnessGoal: localStorage.getItem('fitnessGoal') || 'maintain_build',
        measurementSystem: localStorage.getItem('preferredSystem') || 'metric'
    };
    
    console.log('📊 USER DATA COLLECTED:');
    console.log('  - Gender:', userData.gender);
    console.log('  - Age:', userData.age);
    console.log('  - Height:', userData.height);
    console.log('  - Weight:', userData.weight);
    console.log('  - Activity Level:', userData.activityLevel);
    console.log('  - Fitness Goal:', userData.fitnessGoal);
    console.log('  - Measurement System:', userData.measurementSystem);
    
    // Convert measurements to metric if needed
    let heightCm = userData.height;
    let weightKg = userData.weight;
    
    if (userData.measurementSystem === 'imperial') {
        console.log('🔄 CONVERTING IMPERIAL TO METRIC:');
        console.log('  - Height (inches):', userData.height);
        console.log('  - Weight (lbs):', userData.weight);
        
        // Convert total inches to cm
        heightCm = userData.height * 2.54;
        // Convert lbs to kg
        weightKg = userData.weight * 0.453592;
        
        console.log('  - Height converted (cm):', heightCm);
        console.log('  - Weight converted (kg):', weightKg);
    }
    
    // Calculate BMR using Mifflin-St Jeor Equation
    let bmr;
    if (userData.gender === 'male') {
        bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * userData.age) + 5;
        console.log('⚡ BMR CALCULATION (MALE):');
        console.log(`  BMR = (10 × ${weightKg}) + (6.25 × ${heightCm}) - (5 × ${userData.age}) + 5`);
    } else {
        bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * userData.age) - 161;
        console.log('⚡ BMR CALCULATION (FEMALE):');
        console.log(`  BMR = (10 × ${weightKg}) + (6.25 × ${heightCm}) - (5 × ${userData.age}) - 161`);
    }
    
    console.log('  BMR Result:', bmr);
    
    // Activity multipliers
    const activityMultipliers = {
        'not_very_active': 1.2,    // Desk job, minimal exercise
        'lightly_active': 1.375,   // Light exercise 1-3 days/week
        'active': 1.55,            // Moderate exercise 3-5 days/week
        'very_active': 1.725,      // Intense exercise 6-7 days/week
        'high_intensity': 1.9      // Professional athlete level
    };
    
    // Calculate TDEE
    const multiplier = activityMultipliers[userData.activityLevel] || 1.55;
    const tdee = Math.round(bmr * multiplier);
    
    console.log('🏃 TDEE CALCULATION:');
    console.log('  - Activity Level:', userData.activityLevel);
    console.log('  - Multiplier:', multiplier);
    console.log('  - TDEE = BMR × Multiplier');
    console.log(`  - TDEE = ${bmr} × ${multiplier} = ${tdee}`);
    
    // Display TDEE on page (both desktop and mobile)
    const tdeeDisplayDesktop = document.querySelector('#tdee-result');
    const tdeeDisplayMobile = document.querySelector('#tdee-result-mob');
    
    if (tdeeDisplayDesktop) {
        tdeeDisplayDesktop.textContent = tdee;
        console.log('✅ TDEE DISPLAYED ON DESKTOP:', tdee);
    } else {
        console.log('⚠️ Desktop #tdee-result element not found');
    }
    
    if (tdeeDisplayMobile) {
        tdeeDisplayMobile.textContent = tdee;
        console.log('✅ TDEE DISPLAYED ON MOBILE:', tdee);
    } else {
        console.log('⚠️ Mobile #tdee-result-mob element not found');
    }
    
    if (!tdeeDisplayDesktop && !tdeeDisplayMobile) {
        console.log('❌ ERROR: Could not find any TDEE display elements');
        console.log('   Make sure you added id="tdee-result" and id="tdee-result-mob"');
    }
    
    // Store TDEE and complete profile for later use
    localStorage.setItem('calculatedTDEE', tdee);
    
    const completeProfile = {
        ...userData,
        heightCm: heightCm,
        weightKg: weightKg,
        bmr: Math.round(bmr),
        tdee: tdee,
        calculatedAt: new Date().toISOString()
    };
    
    localStorage.setItem('userProfile', JSON.stringify(completeProfile));
    
    console.log('💾 COMPLETE PROFILE STORED:');
    console.log(completeProfile);
    console.log('🎉 TDEE CALCULATION COMPLETE! 🎉');
});
</script>
---

<!-- Insert HEADER script for Your Results -->
<script>
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('preview') === 'true') {
  console.log('Edit mode - bypassing protection');
} else if (!localStorage.getItem('activityLevel') || !document.referrer.includes('iqcalorie.com')) {
  window.location.replace('https://www.iqcalorie.com/landing');
}
</script>

## 10. Preferred Diet

![10_preferred_diet_clickfunnels.png](10_preferred_diet_clickfunnels.png)

```html

<script>
// Diet Preference Selection UI Code - ORIGINAL with TRIM FIX ONLY
// Desktop Version
document.addEventListener("DOMContentLoaded", function () {
  const everything = document.querySelector("#everything");
  const mediterranean = document.querySelector("#mediterranean");
  const keto = document.querySelector("#keto");
  const paleo = document.querySelector("#paleo");
  const vegan = document.querySelector("#vegan");
  const dash = document.querySelector("#dash");
  const lowCarb = document.querySelector("#lowCarb");
  const intermittentFasting = document.querySelector("#intermittentFasting");
  const glutenFree = document.querySelector("#glutenFree");
  const flexitarian = document.querySelector("#flexitarian");
  const other = document.querySelector("#other");
  const otherRowInputField = document.querySelector("#otherRowInputField");
  const otherInputField = document.querySelector("#other-input-field1");
  
  // Try to find the actual input element - it might be inside a container
  let actualInputField = otherInputField;
  if (otherInputField) {
    console.log("Initial element:", otherInputField, "Tag:", otherInputField.tagName);
    
    if (otherInputField.tagName !== 'INPUT') {
      // It's a container, find the input inside
      const inputInside = otherInputField.querySelector('input') || 
                         otherInputField.querySelector('input[type="text"]') ||
                         otherInputField.querySelector('textarea');
      
      if (inputInside) {
        actualInputField = inputInside;
        console.log("Found actual input inside container:", actualInputField, "Tag:", actualInputField.tagName);
      } else {
        console.log("No input found inside container, searching children:");
        for (let i = 0; i < otherInputField.children.length; i++) {
          console.log("Child", i, ":", otherInputField.children[i]);
        }
      }
    }
  }
  const nextBtn = document.querySelector("#next-btn-desk-10");
  
  const options = [everything, mediterranean, keto, paleo, vegan, dash, lowCarb, intermittentFasting, glutenFree, flexitarian, other];
  
  // Start with transparent next button and hidden other input field
  if (nextBtn) {
    nextBtn.style.opacity = "0.5";
  }
  if (otherRowInputField) {
    otherRowInputField.style.display = "none";
  }
  // Set default light gray border on input field
  if (otherInputField) {
    otherInputField.style.setProperty("border", "1px solid #d3d3d3", "important");
  }
  
  // Add hover and click styles to all option cards
  options.forEach(function(option) {
    if (option) {
      // Set cursor pointer
      option.style.cursor = "pointer";
      
      // Hover effect
      option.addEventListener("mouseenter", function() {
        this.style.backgroundColor = "rgba(255, 102, 0, 0.05)";
        this.style.border = "2px solid #ff6600";
      });
      
      // Remove hover effect
      option.addEventListener("mouseleave", function() {
        if (!this.classList.contains("selected")) {
          this.style.backgroundColor = "";
          this.style.border = "";
        }
      });
      
      // Click effect
      option.addEventListener("click", function() {
        // Remove selected class from all options
        options.forEach(function(opt) {
          if (opt) {
            opt.classList.remove("selected");
            opt.style.backgroundColor = "";
            opt.style.border = "";
          }
        });
        
        // Add selected styles to clicked option
        this.classList.add("selected");
        this.style.backgroundColor = "rgba(255, 102, 0, 0.1)";
        this.style.border = "2px solid #ff6600";
        
        // Handle "Other" option differently
        if (this === other) {
          // Show the other input field
          if (otherRowInputField) {
            otherRowInputField.style.display = "block";
          }
          // Focus on the input field
          if (actualInputField) {
            actualInputField.focus();
          }
          // Store diet preference
          localStorage.setItem('dietPreference', 'other');
          console.log('Diet preference stored: other');
          
          // IMPORTANT: Clear any previous compiled data so it gets re-compiled with new diet data
          localStorage.removeItem('compiledUserData');
          localStorage.removeItem('supabaseReadyData');
          console.log('Cleared compiled data for fresh compilation');
          
          // IMPORTANT: Clear any previous compiled data so it gets re-compiled with new diet data
          localStorage.removeItem('compiledUserData');
          localStorage.removeItem('supabaseReadyData');
          console.log('Cleared compiled data for fresh compilation');
        } else {
          // Hide the other input field if not "Other"
          if (otherRowInputField) {
            otherRowInputField.style.display = "none";
          }
          
          // Store diet preference based on which option was clicked
          if (this === everything) {
            localStorage.setItem('dietPreference', 'everything');
            console.log('Diet preference stored: everything');
          } else if (this === mediterranean) {
            localStorage.setItem('dietPreference', 'mediterranean');
            console.log('Diet preference stored: mediterranean');
          } else if (this === keto) {
            localStorage.setItem('dietPreference', 'keto');
            console.log('Diet preference stored: keto');
          } else if (this === paleo) {
            localStorage.setItem('dietPreference', 'paleo');
            console.log('Diet preference stored: paleo');
          } else if (this === vegan) {
            localStorage.setItem('dietPreference', 'vegan');
            console.log('Diet preference stored: vegan');
          } else if (this === dash) {
            localStorage.setItem('dietPreference', 'dash');
            console.log('Diet preference stored: dash');
          } else if (this === lowCarb) {
            localStorage.setItem('dietPreference', 'lowCarb');
            console.log('Diet preference stored: lowCarb');
          } else if (this === intermittentFasting) {
            localStorage.setItem('dietPreference', 'intermittentFasting');
            console.log('Diet preference stored: intermittentFasting');
          } else if (this === glutenFree) {
            localStorage.setItem('dietPreference', 'glutenFree');
            console.log('Diet preference stored: glutenFree');
          } else if (this === flexitarian) {
            localStorage.setItem('dietPreference', 'flexitarian');
            console.log('Diet preference stored: flexitarian');
          }
          
          // Check fitness goal and redirect accordingly
          const fitnessGoal = localStorage.getItem('fitnessGoal');
          if (fitnessGoal === 'maintain_build') {
            // Skip target weight and weekly results for maintain weight users
            window.location.href = "https://josephselwansteamwo4bf45.myclickfunnels.com/choose-your-plan";
          } else {
            // Go to target weight for lose/gain weight users
            window.location.href = "https://josephselwansteamwo4bf45.myclickfunnels.com/target-weight";
          }
        }
      });
    }
  });
  
  // Handle the other input field - FIXED TRIM ERROR + BETTER ELEMENT FINDING
  if (actualInputField) {
    console.log("Setting up input handler for:", actualInputField);
    console.log("Element tag name:", actualInputField.tagName);
    console.log("Element has value property:", 'value' in actualInputField);
    
    // Add orange border when typing (on input)
    actualInputField.addEventListener("input", function() {
      console.log("Input event triggered, this:", this);
      console.log("Input event triggered, value:", this.value);
      
      // SAFE VALUE RETRIEVAL - Check if this.value exists before using trim()
      if (this && this.value !== undefined && this.value !== null) {
        const inputValue = this.value.toString();
        
        // Always show orange border when there's content
        if (inputValue !== "") {
          console.log("Enabling next button");
          this.style.setProperty("border", "2px solid #ff6600", "important");
          // Make next button clickable when there's text
          if (nextBtn) {
            nextBtn.style.opacity = "1";
            nextBtn.style.pointerEvents = "auto";
            nextBtn.style.cursor = "pointer";
          }
          // Store the custom diet preference - SAFE TRIM
          localStorage.setItem('dietPreferenceCustom', inputValue.trim());
          console.log('Custom diet preference stored: ' + inputValue.trim());
          
          // IMPORTANT: Clear compiled data so it gets re-compiled with new custom diet
          localStorage.removeItem('compiledUserData');
          localStorage.removeItem('supabaseReadyData');
          console.log('Cleared compiled data for fresh compilation with custom diet');
          
          // IMPORTANT: Clear compiled data so it gets re-compiled with new custom diet
          localStorage.removeItem('compiledUserData');
          localStorage.removeItem('supabaseReadyData');
          console.log('Cleared compiled data for fresh compilation with custom diet');
        } else {
          console.log("Disabling next button");
          // Remove orange border and make button transparent if empty
          this.style.setProperty("border", "1px solid #d3d3d3", "important");
          if (nextBtn) {
            nextBtn.style.opacity = "0.5";
            nextBtn.style.pointerEvents = "none";
            nextBtn.style.cursor = "default";
          }
        }
      } else {
        console.log("Value is undefined or null, this:", this, "this.value:", this.value);
      }
    });
    
    // Remove border when field loses focus and is empty
    actualInputField.addEventListener("blur", function() {
      console.log("Blur event triggered");
      // SAFE VALUE CHECK
      if (this && this.value !== undefined && this.value === "") {
        this.style.setProperty("border", "1px solid #d3d3d3", "important");
      }
    });
  } else {
    console.log("otherInputField not found, trying alternative selectors");
    
    // Try to find the input field with alternative selectors after Other is clicked
    if (other) {
      const originalOtherClick = other.onclick;
      other.addEventListener("click", function() {
        setTimeout(() => {
          let inputField = document.querySelector("#other-input-field1") ||
                          document.querySelector("input[placeholder*='diet']") ||
                          document.querySelector("#otherRowInputField input") ||
                          document.querySelector("input[type='text']:not([id])");
          
          console.log("Alternative input field found:", inputField);
          
          if (inputField && !inputField.hasAttribute('data-handler-added')) {
            inputField.setAttribute('data-handler-added', 'true');
            
            inputField.addEventListener("input", function() {
              console.log("Alternative input event triggered, value:", this.value);
              
              if (this && this.value !== undefined && this.value !== null) {
                const inputValue = this.value.toString();
                
                if (inputValue !== "") {
                  console.log("Enabling next button via alternative method");
                  this.style.setProperty("border", "2px solid #ff6600", "important");
                  if (nextBtn) {
                    nextBtn.style.opacity = "1";
                    nextBtn.style.pointerEvents = "auto";
                    nextBtn.style.cursor = "pointer";
                  }
                  localStorage.setItem('dietPreferenceCustom', inputValue.trim());
                  console.log('Custom diet preference stored: ' + inputValue.trim());
                } else {
                  console.log("Disabling next button via alternative method");
                  this.style.setProperty("border", "1px solid #d3d3d3", "important");
                  if (nextBtn) {
                    nextBtn.style.opacity = "0.5";
                    nextBtn.style.pointerEvents = "none";
                    nextBtn.style.cursor = "default";
                  }
                }
              }
            });
          }
        }, 200);
      });
    }
  }
  
  // Handle next button click
  if (nextBtn) {
    nextBtn.addEventListener("click", function(e) {
      e.preventDefault();
      // Check if this button is active (opaque)
      if (this.style.opacity === "1") {
        const fitnessGoal = localStorage.getItem('fitnessGoal');
        if (fitnessGoal === 'maintain_build') {
          window.location.href = "https://josephselwansteamwo4bf45.myclickfunnels.com/choose-your-plan";
        } else {
          window.location.href = "https://josephselwansteamwo4bf45.myclickfunnels.com/target-weight";
        }
      }
    });
  }
});
</script>

<script>
// Mobile Version - BORDER FIX (added border-radius to match corners)
document.addEventListener("DOMContentLoaded", function () {
  const everything = document.querySelector("#everything");
  const mediterranean = document.querySelector("#mediterranean");
  const keto = document.querySelector("#keto");
  const paleo = document.querySelector("#paleo");
  const vegan = document.querySelector("#vegan");
  const dash = document.querySelector("#dash");
  const lowCarb = document.querySelector("#lowCarb");
  const intermittentFasting = document.querySelector("#intermittentFasting");
  const glutenFree = document.querySelector("#glutenFree");
  const flexitarian = document.querySelector("#flexitarian");
  const other = document.querySelector("#other");
  const otherRowInputField = document.querySelector("#otherRowInputField");
  const otherInputField = document.querySelector("#other-input-field1");
  const nextBtn = document.querySelector("#next-btn-mob-10");
  
  const options = [everything, mediterranean, keto, paleo, vegan, dash, lowCarb, intermittentFasting, glutenFree, flexitarian, other];
  
  // Start with transparent next button and hidden other input field
  if (nextBtn) {
    nextBtn.style.opacity = "0.5";
  }
  if (otherRowInputField) {
    otherRowInputField.style.display = "none";
  }
  
  // Add touch and click styles to all option cards
  options.forEach(function(option) {
    if (option) {
      // Set cursor pointer
      option.style.cursor = "pointer";
      
      // Touch effect for mobile
      option.addEventListener("touchstart", function() {
        this.style.backgroundColor = "rgba(255, 102, 0, 0.05)";
        this.style.border = "2px solid #ff6600";
      });
      
      // Click effect
      option.addEventListener("click", function() {
        // Remove selected class from all options
        options.forEach(function(opt) {
          if (opt) {
            opt.classList.remove("selected");
            opt.style.backgroundColor = "";
            opt.style.border = "";
          }
        });
        
        // Add selected styles to clicked option
        this.classList.add("selected");
        this.style.backgroundColor = "rgba(255, 102, 0, 0.1)";
        this.style.border = "2px solid #ff6600";
        
        // Handle "Other" option differently
        if (this === other) {
          // Show the other input field
          if (otherRowInputField) {
            otherRowInputField.style.display = "block";
          }
          // Focus on the input field
          if (otherInputField) {
            otherInputField.focus();
          }
          // Store diet preference
          localStorage.setItem('dietPreference', 'other');
        } else {
          // Hide the other input field if not "Other"
          if (otherRowInputField) {
            otherRowInputField.style.display = "none";
          }
          
          // Store diet preference based on which option was clicked
          if (this === everything) {
            localStorage.setItem('dietPreference', 'everything');
          } else if (this === mediterranean) {
            localStorage.setItem('dietPreference', 'mediterranean');
          } else if (this === keto) {
            localStorage.setItem('dietPreference', 'keto');
          } else if (this === paleo) {
            localStorage.setItem('dietPreference', 'paleo');
          } else if (this === vegan) {
            localStorage.setItem('dietPreference', 'vegan');
          } else if (this === dash) {
            localStorage.setItem('dietPreference', 'dash');
          } else if (this === lowCarb) {
            localStorage.setItem('dietPreference', 'lowCarb');
          } else if (this === intermittentFasting) {
            localStorage.setItem('dietPreference', 'intermittentFasting');
          } else if (this === glutenFree) {
            localStorage.setItem('dietPreference', 'glutenFree');
          } else if (this === flexitarian) {
            localStorage.setItem('dietPreference', 'flexitarian');
          }
          
          // Check fitness goal and redirect accordingly
          const fitnessGoal = localStorage.getItem('fitnessGoal');
          if (fitnessGoal === 'maintain_build') {
            window.location.href = "https://josephselwansteamwo4bf45.myclickfunnels.com/choose-your-plan";
          } else {
            window.location.href = "https://josephselwansteamwo4bf45.myclickfunnels.com/target-weight";
          }
        }
      });
    }
  });
  
  // Handle the other input field - FIXED BORDER STYLING
  if (otherInputField) {
    // Add orange border when typing (on input)
    otherInputField.addEventListener("input", function(event) {
      // Improved value retrieval
      const inputValue = (this.value !== undefined && this.value !== null) ? 
                        this.value.toString() : 
                        (event.target.value || "");
      
      // Always show orange border when there's content
      if (inputValue !== "" && inputValue !== "undefined") {
        // FIXED: Added border-radius to eliminate white corners
        this.style.setProperty("border", "2px solid #ff6600", "important");
        this.style.setProperty("border-radius", "12px", "important");
        // Make next button clickable when there's text
        if (nextBtn) {
          nextBtn.style.opacity = "1";
          nextBtn.style.pointerEvents = "auto";
          nextBtn.style.cursor = "pointer";
        }
        // Store the custom diet preference
        localStorage.setItem('dietPreferenceCustom', inputValue.trim());
      } else {
        // Remove orange border and make button transparent if empty
        this.style.setProperty("border", "1px solid #d3d3d3", "important");
        this.style.setProperty("border-radius", "12px", "important");
        if (nextBtn) {
          nextBtn.style.opacity = "0.5";
          nextBtn.style.pointerEvents = "none";
          nextBtn.style.cursor = "default";
        }
      }
    });
    
    // Remove border when field loses focus and is empty
    otherInputField.addEventListener("blur", function() {
      const inputValue = this.value || "";
      if (inputValue === "") {
        this.style.setProperty("border", "1px solid #d3d3d3", "important");
        this.style.setProperty("border-radius", "12px", "important");
      }
    });
  }
  
  // Handle next button click
  if (nextBtn) {
    nextBtn.addEventListener("click", function(e) {
      e.preventDefault();
      // Check if this button is active (opaque)
      if (this.style.opacity === "1") {
        const fitnessGoal = localStorage.getItem('fitnessGoal');
        if (fitnessGoal === 'maintain_build') {
          window.location.href = "https://josephselwansteamwo4bf45.myclickfunnels.com/choose-your-plan";
        } else {
          window.location.href = "https://josephselwansteamwo4bf45.myclickfunnels.com/target-weight";
        }
      }
    });
  }
});
</script>


<!-- Insert HEADER script for Preferred Diet -->
<script>
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('preview') === 'true') {
  console.log('Edit mode - bypassing protection');
} else if (!localStorage.getItem('calculatedTDEE') || !document.referrer.includes('iqcalorie.com')) {
  window.location.replace('https://www.iqcalorie.com/landing');
}
</script>



## 11. Target Weight

![11_target_weight_clickfunnels.png](11_target_weight_clickfunnels.png)

```html
<!-- Insert footer script for Target Weight -->
```
<script>
// Target Weight Page - Complete Fix WITH DEBUG TIMING
(function() {
    "use strict";
    
    const pageStartTime = performance.now();
    console.log("Target Weight script start at", pageStartTime.toFixed(1) + "ms");
    
    function initTargetWeight() {
        const initStartTime = performance.now() - pageStartTime;
        console.log("Init start at +" + initStartTime.toFixed(1) + "ms");
        
        var fitnessGoal, measurementSystem, currentWeight;
        
        try {
            fitnessGoal = localStorage.getItem("fitnessGoal");
            measurementSystem = localStorage.getItem("preferredSystem");
            currentWeight = parseFloat(localStorage.getItem("weight")) || 0;
        } catch (e) {
            console.error("Storage access failed:", e);
            fitnessGoal = null;
            measurementSystem = null;
            currentWeight = 0;
        }
        
        console.log("User data:", { 
            fitnessGoal: fitnessGoal, 
            measurementSystem: measurementSystem, 
            currentWeight: currentWeight 
        });
        
        // CRITICAL: Redirect maintain weight users immediately
        if (fitnessGoal === "maintain_build") {
            console.log("Redirecting maintain weight user immediately");
            window.location.href = "https://josephselwansteamwo4bf45.myclickfunnels.com/preferred-diet";
            return;
        }
        
        // Validate fitness goal
        if (!fitnessGoal || (fitnessGoal !== "lose_weight" && fitnessGoal !== "gain_weight")) {
            console.log("Invalid fitness goal, redirecting to primary fitness goal");
            window.location.href = "https://josephselwansteamwo4bf45.myclickfunnels.com/primary-fitness-goal";
            return;
        }
        
        // Get all page elements
        var metricRow = document.getElementById("metricTargetWeightRow");
        var imperialRow = document.getElementById("imperialTargetWeightRow");
        
        // Get input fields
        var metricInput = metricRow ? metricRow.querySelector("input") : null;
        var imperialInput = imperialRow ? imperialRow.querySelector("input") : null;
        
        // Get ALL possible error elements
        var allErrorElements = [
            document.getElementById("metric-target-weight-loss-error"),
            document.getElementById("metric-target-weight-gain-error"), 
            document.getElementById("imperial-target-weight-loss-error"),
            document.getElementById("imperial-target-weight-gain-error")
        ];
        
        // Get buttons
        var nextBtnDesktop = document.querySelector("#next-btn-desk-11");
        var nextBtnMobile = document.querySelector("#next-btn-mob-11");
        
        console.log("Elements found:", {
            metricRow: !!metricRow,
            imperialRow: !!imperialRow,
            metricInput: !!metricInput,
            imperialInput: !!imperialInput,
            nextBtnDesktop: !!nextBtnDesktop,
            nextBtnMobile: !!nextBtnMobile
        });
        
        
        
        // STEP 2: Show ONLY the correct measurement system
        const showStartTime = performance.now() - pageStartTime;
        console.log("SHOWING correct system at +" + showStartTime.toFixed(1) + "ms:", measurementSystem);
        
        var activeInput = null;
        var isMetricActive = false;
        
        if (measurementSystem === "metric" && metricRow) {
            metricRow.style.display = "block";
            activeInput = metricInput;
            isMetricActive = true;
            console.log("Showed ONLY metric row");
        } else if (measurementSystem === "imperial" && imperialRow) {
            imperialRow.style.display = "block";
            activeInput = imperialInput;
            isMetricActive = false;
            console.log("Showed ONLY imperial row");
        } else {
            console.error("Could not determine measurement system or find rows");
            return;
        }
        
        const showEndTime = performance.now() - pageStartTime;
        console.log("INIT COMPLETE at +" + showEndTime.toFixed(1) + "ms");
        
        // Button control functions
        function enableButtons() {
            console.log("Enabling buttons");
            [nextBtnDesktop, nextBtnMobile].forEach(function(btn) {
                if (btn) {
                    btn.style.opacity = "1";
                    btn.style.pointerEvents = "auto";
                }
            });
        }
        
        function disableButtons() {
            console.log("Disabling buttons");
            [nextBtnDesktop, nextBtnMobile].forEach(function(btn) {
                if (btn) {
                    btn.style.opacity = "0.5";
                    btn.style.pointerEvents = "none";
                }
            });
        }
        
        // Validation function
        function validateInput(value) {
            console.log("Validating input:", {
                value: value,
                currentWeight: currentWeight,
                fitnessGoal: fitnessGoal,
                isMetric: isMetricActive
            });
            
            // Clear all errors first
            allErrorElements.forEach(function(el) {
                if (el) el.style.display = "none";
            });
            
            // Check if empty
            if (!value || value.trim() === "") {
                disableButtons();
                return false;
            }
            
            // Parse and validate number
            var target = parseFloat(value);
            if (isNaN(target) || target <= 0) {
                disableButtons();
                return false;
            }
            
            // Determine which error to show based on goal and measurement system
            var errorToShow = null;
            var isValid = true;
            
            if (fitnessGoal === "lose_weight") {
                if (target >= currentWeight) {
                    isValid = false;
                    if (isMetricActive) {
                        errorToShow = document.getElementById("metric-target-weight-loss-error");
                    } else {
                        errorToShow = document.getElementById("imperial-target-weight-loss-error");
                    }
                }
            } else if (fitnessGoal === "gain_weight") {
                if (target <= currentWeight) {
                    isValid = false;
                    if (isMetricActive) {
                        errorToShow = document.getElementById("metric-target-weight-gain-error");
                    } else {
                        errorToShow = document.getElementById("imperial-target-weight-gain-error");
                    }
                }
            }
            
            if (!isValid) {
                disableButtons();
                if (errorToShow) {
                    errorToShow.style.display = "block";
                    console.log("Showing error:", errorToShow.id);
                }
                return false;
            }
            
            // Valid input
            console.log("Input is valid");
            enableButtons();
            try {
                localStorage.setItem("targetWeight", value);
                console.log("Target weight stored:", value);
            } catch (e) {
                console.error("Failed to store target weight:", e);
            }
            return true;
        }
        
        // Add input listener to active input only
        if (activeInput) {
            console.log("Adding input listener to active input");
            activeInput.addEventListener("input", function() {
                validateInput(this.value);
            });
        } else {
            console.error("No active input found");
        }
        
        // Add button click handlers
        function handleNextClick(e) {
            if (this.style.opacity === "1") {
                console.log("Proceeding to weekly results");
                setTimeout(function() {
                    window.location.href = "https://josephselwansteamwo4bf45.myclickfunnels.com/weekly-results";
                }, 100);
            } else {
                e.preventDefault();
                e.stopPropagation();
                console.log("Button click prevented - validation required");
            }
        }
        
        [nextBtnDesktop, nextBtnMobile].forEach(function(btn) {
            if (btn) {
                btn.addEventListener("click", handleNextClick);
            }
        });
        
        console.log("Target Weight initialization complete");
    }
    
    // Execute when DOM is ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initTargetWeight);
    } else {
        initTargetWeight();
    }
})();
</script>


---
<script>
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('preview') === 'true') {
  console.log('Edit mode - bypassing protection');
} else if (!localStorage.getItem('dietPreference') || !document.referrer.includes('iqcalorie.com')) {
  window.location.replace('https://www.iqcalorie.com/landing');
}
</script>

<!-- Add this script in the HEADER section of the Target Weight page, not footer -->
<script>
// IMMEDIATE redirect check - runs before page renders
(function() {
    try {
        var fitnessGoal = localStorage.getItem("fitnessGoal");
        if (fitnessGoal === "maintain_build") {
            window.location.replace("https://josephselwansteamwo4bf45.myclickfunnels.com/preferred-diet");
        }
    } catch (e) {
        console.log("Could not check fitness goal for redirect");
    }
})();
</script>


<!-- Add this script in the CSS section of the Target Weight page, not footer -->
#metricTargetWeightRow{
  display:none;
}

#imperialTargetWeightRow{
  display:none;
}

#metric-target-weight-loss-error{
  display:none;
}

#metric-target-weight-gain-error{
  display:none;
}

#imperial-target-weight-gain-error{
  display:none;
}

#imperial-target-weight-loss-error{
  display:none;
}



## 12. Weekly Results / Plan

![12_weekly_results_clickfunnels.png](12_weekly_results_clickfunnels.png)

```html
<!-- Insert footer script for Weekly Results -->
```
<script>
(function() {
    "use strict";
    
    console.log("Weekly Results page script loading...");

    function initWeeklyResults() {
        console.log("🔥 WEEKLY RESULTS PAGE LOGIC START 🔥");
        
        // Get stored user preferences with fallbacks
        var fitnessGoal, measurementSystem;
        
        try {
            fitnessGoal = localStorage.getItem('fitnessGoal') || '';
            measurementSystem = localStorage.getItem('preferredSystem') || '';
        } catch (e) {
            console.error("Cannot access localStorage:", e);
            fitnessGoal = '';
            measurementSystem = '';
        }
        
        console.log('Retrieved fitness goal:', fitnessGoal);
        console.log('Retrieved measurement system:', measurementSystem);
        
        // Step 1: Check if this page should be shown at all
        if (fitnessGoal === 'maintain_build') {
            console.log('❌ User selected "Maintain Weight" - redirecting away from this page');
            window.location.href = "https://josephselwansteamwo4bf45.myclickfunnels.com/preferred-diet";
            return;
        }
        
        if (fitnessGoal !== 'lose_weight' && fitnessGoal !== 'gain_weight') {
            console.log('⚠️ No valid fitness goal found - redirecting to fitness goal page');
            window.location.href = "https://josephselwansteamwo4bf45.myclickfunnels.com/primary-fitness-goal";
            return;
        }
        
        console.log('✅ Page should be shown - user goal is:', fitnessGoal);
        
        // Step 2: Get all elements using reliable method
        function getAllElements() {
            // Get headlines
            var headlineLoss = document.getElementById('headlineLoss');
            var headlineGain = document.getElementById('headlineGain');
            
            // Define all possible button IDs
            var buttonIds = [
                // Imperial loss
                '-0.5lbs', '-1lbs', '-1.5lbs', '-2lbs',
                // Imperial gain  
                '+0.5lbs', '+1lbs', '+1.5lbs', '+2lbs',
                // Metric loss
                '-0.25kg', '-0.5kg', '-0.75kg', '-1kg',
                // Metric gain
                '+0.25kg', '+0.5kg', '+0.75kg', '+1kg'
            ];
            
            // Get all buttons that exist on the page
            var allButtons = {};
            buttonIds.forEach(function(id) {
                var element = document.getElementById(id);
                if (element) {
                    allButtons[id] = element;
                    console.log('Found button:', id);
                } else {
                    console.log('Button not found:', id);
                }
            });
            
            return {
                headlineLoss: headlineLoss,
                headlineGain: headlineGain,
                buttons: allButtons
            };
        }
        
        var elements = getAllElements();
        
        // Step 3: Hide all elements initially
        function hideAllElements() {
            console.log('🔒 Hiding all headlines and buttons');
            
            // Hide headlines
            if (elements.headlineLoss) elements.headlineLoss.style.display = 'none';
            if (elements.headlineGain) elements.headlineGain.style.display = 'none';
            
            // Hide all buttons
            Object.values(elements.buttons).forEach(function(btn) {
                btn.style.display = 'none';
            });
        }
        
        // Step 4: Show only relevant elements
        function showRelevantElements() {
            console.log('🎯 Showing elements for:', { fitnessGoal: fitnessGoal, measurementSystem: measurementSystem });
            
            // Show appropriate headline
            if (fitnessGoal === 'lose_weight' && elements.headlineLoss) {
                elements.headlineLoss.style.display = 'block';
                console.log('✅ Showing loss headline');
            } else if (fitnessGoal === 'gain_weight' && elements.headlineGain) {
                elements.headlineGain.style.display = 'block';
                console.log('✅ Showing gain headline');
            }
            
            // Determine which buttons to show
            var buttonsToShow = [];
            
            if (measurementSystem === 'imperial') {
                if (fitnessGoal === 'lose_weight') {
                    buttonsToShow = ['-0.5lbs', '-1lbs', '-1.5lbs', '-2lbs'];
                    console.log('📊 Showing imperial loss buttons');
                } else if (fitnessGoal === 'gain_weight') {
                    buttonsToShow = ['+0.5lbs', '+1lbs', '+1.5lbs', '+2lbs'];
                    console.log('📊 Showing imperial gain buttons');
                }
            } else if (measurementSystem === 'metric') {
                if (fitnessGoal === 'lose_weight') {
                    buttonsToShow = ['-0.25kg', '-0.5kg', '-0.75kg', '-1kg'];
                    console.log('📊 Showing metric loss buttons');
                } else if (fitnessGoal === 'gain_weight') {
                    buttonsToShow = ['+0.25kg', '+0.5kg', '+0.75kg', '+1kg'];
                    console.log('📊 Showing metric gain buttons');
                }
            }
            
            // Show the selected buttons
            buttonsToShow.forEach(function(buttonId) {
                if (elements.buttons[buttonId]) {
                    elements.buttons[buttonId].style.display = 'block';
                    console.log('  ✅ Showing button:', buttonId);
                } else {
                    console.log('  ⚠️ Button not found:', buttonId);
                }
            });
        }
        
        // Step 5: Add click handlers
        function addClickHandlers() {
            console.log('🖱️ Adding click handlers to buttons');
            
            Object.entries(elements.buttons).forEach(function(entry) {
                var buttonId = entry[0];
                var btn = entry[1];
                
                // Set cursor pointer
                btn.style.cursor = 'pointer';
                
                // Add hover effect
                btn.addEventListener('mouseenter', function() {
                    this.style.backgroundColor = 'rgba(255, 102, 0, 0.05)';
                    this.style.border = '2px solid #ff6600';
                });
                
                btn.addEventListener('mouseleave', function() {
                    if (!this.classList.contains('selected')) {
                        this.style.backgroundColor = '';
                        this.style.border = '';
                    }
                });
                
                // Add click effect
                btn.addEventListener('click', function() {
                    console.log('Button clicked:', buttonId);
                    
                    // Remove selected class from all buttons
                    Object.values(elements.buttons).forEach(function(otherBtn) {
                        otherBtn.classList.remove('selected');
                        otherBtn.style.backgroundColor = '';
                        otherBtn.style.border = '';
                    });
                    
                    // Add selected styles to clicked button
                    this.classList.add('selected');
                    this.style.backgroundColor = 'rgba(255, 102, 0, 0.1)';
                    this.style.border = '2px solid #ff6600';
                    
                    // Store weekly goal
                    try {
                        // Store weekly goal with safeguard for maintain_build users
                          try {
                              const currentFitnessGoal = localStorage.getItem('fitnessGoal');
                              if (currentFitnessGoal === 'maintain_build') {
                                  console.log('⚠️ Maintain build user - not storing weekly weight goal');
                                  localStorage.removeItem('weeklyWeightGoal'); // Clear any existing value
                              } else {
                                  localStorage.setItem('weeklyWeightGoal', buttonId);
                                  console.log('Weekly weight goal stored:', buttonId);
                              }
                          } catch (e) {
                              console.error('Failed to store weekly goal:', e);
                          }
                        console.log('Weekly weight goal stored:', buttonId);
                    } catch (e) {
                        console.error('Failed to store weekly goal:', e);
                    }
                    
                    // Redirect to next step
                    setTimeout(function() {
                        window.location.href = "https://www.iqcalorie.com/choose-your-plan";
                    }, 200);
                });
            });
        }
        
        // Execute the logic
        hideAllElements();
        showRelevantElements();
        addClickHandlers();
        
        console.log('🎉 WEEKLY RESULTS PAGE LOGIC COMPLETE! 🎉');
    }
    
    // Run when DOM is ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initWeeklyResults);
    } else {
        initWeeklyResults();
    }
})();
</script>
---

<!-- Insert HEADER script for Weekly Results -->
<script>
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('preview') === 'true') {
  console.log('Edit mode - bypassing protection');
} else if (!localStorage.getItem('targetWeight') || !document.referrer.includes('iqcalorie.com')) {
  window.location.replace('https://www.iqcalorie.com/landing');
}
</script>



## 13. Choose Your Plan 

```html
<!-- COMPLETE CHOOSE YOUR PLAN FOOTER SCRIPT -->
<!-- PART 1: Your existing code (KEEP AS-IS) -->

<script>
// Choose Your Plan Page - Smooth Transition Logic

// IMMEDIATE: Show correct elements based on localStorage (no delay, no flash)
(function() {
    console.log("🚀 IMMEDIATE EXECUTION - Reading localStorage...");
    
    // Get user data immediately
    var measurementSystem = 'metric';
    var fitnessGoal = 'maintain';
    
    try {
        measurementSystem = localStorage.getItem('preferredSystem') || 'metric';
        var rawFitnessGoal = localStorage.getItem('fitnessGoal');
        
        if (rawFitnessGoal === 'gain_weight') {
            fitnessGoal = 'gain';
        } else if (rawFitnessGoal === 'lose_weight') {
            fitnessGoal = 'lose';
        } else if (rawFitnessGoal === 'maintain_build') {
            fitnessGoal = 'maintain';
        } else {
            fitnessGoal = 'maintain';
        }
        
        console.log("📋 Immediate data: " + measurementSystem + " + " + fitnessGoal);
        
    } catch (error) {
        console.log("❌ Error reading localStorage: " + error);
    }
    
    // Determine which elements to show
    var targetHeadlineId = null;
    var targetChartId = null;
    
    if (fitnessGoal === 'maintain') {
        targetHeadlineId = '#maintainWeight';
    } else if (measurementSystem === 'metric' && fitnessGoal === 'gain') {
        targetHeadlineId = '#gainWeightMet';
        targetChartId = '#gainWeightChart';
    } else if (measurementSystem === 'metric' && fitnessGoal === 'lose') {
        targetHeadlineId = '#loseWeightMet';
        targetChartId = '#loseWeightChart';
    } else if (measurementSystem === 'imperial' && fitnessGoal === 'gain') {
        targetHeadlineId = '#gainWeightImp';
        targetChartId = '#gainWeightChart';
    } else if (measurementSystem === 'imperial' && fitnessGoal === 'lose') {
        targetHeadlineId = '#loseWeightImp';
        targetChartId = '#loseWeightChart';
    }
    
    // Create CSS to hide all elements EXCEPT the target ones
    var hideElements = [
        '#gainWeightMet',
        '#loseWeightMet',
        '#gainWeightImp', 
        '#loseWeightImp',
        '#maintainWeight',
        '#gainWeightChart',
        '#loseWeightChart'
    ];
    
    // Remove target elements from hide list
    if (targetHeadlineId) {
        var headlineIndex = hideElements.indexOf(targetHeadlineId);
        if (headlineIndex > -1) {
            hideElements.splice(headlineIndex, 1);
        }
    }
    
    if (targetChartId) {
        var chartIndex = hideElements.indexOf(targetChartId);
        if (chartIndex > -1) {
            hideElements.splice(chartIndex, 1);
        }
    }
    
    // Apply CSS to hide only the unwanted elements
    var cssRules = hideElements.map(function(id) {
        return id + ' { display: none !important; }';
    }).join('\n');
    
    var style = document.createElement('style');
    style.textContent = cssRules;
    document.head.appendChild(style);
    
    console.log("✅ CSS applied - showing: " + [targetHeadlineId, targetChartId].filter(Boolean).join(', '));
    console.log("❌ CSS applied - hiding: " + hideElements.join(', '));
    
})();

// Define functions first
function verifyPageState() {
    console.log("🔍 VERIFYING PAGE STATE...");
    
    var userData = getUserOnboardingData();
    
    console.log("📋 User Data Retrieved:");
    console.log("  - Measurement System: " + userData.measurementSystem);
    console.log("  - Fitness Goal: " + userData.fitnessGoal);
    
    // Check which elements are currently visible
    var headlineRows = [
        '#gainWeightMet',
        '#loseWeightMet', 
        '#gainWeightImp',
        '#loseWeightImp',
        '#maintainWeight'
    ];
    
    var chartElements = [
        '#gainWeightChart',
        '#loseWeightChart'
    ];
    
    console.log("👀 VISIBLE HEADLINES:");
    for (var i = 0; i < headlineRows.length; i++) {
        var element = document.querySelector(headlineRows[i]);
        if (element) {
            var isVisible = window.getComputedStyle(element).display !== 'none';
            console.log("  " + headlineRows[i] + ": " + (isVisible ? "✅ VISIBLE" : "❌ HIDDEN"));
        }
    }
    
    console.log("📊 VISIBLE CHARTS:");
    for (var j = 0; j < chartElements.length; j++) {
        var chartElement = document.querySelector(chartElements[j]);
        if (chartElement) {
            var isChartVisible = window.getComputedStyle(chartElement).display !== 'none';
            console.log("  " + chartElements[j] + ": " + (isChartVisible ? "✅ VISIBLE" : "❌ HIDDEN"));
        }
    }
    
    console.log("✅ Page State Verification Complete!");
}

function getUserOnboardingData() {
    var measurementSystem = 'metric';
    var fitnessGoal = 'maintain';
    
    try {
        measurementSystem = localStorage.getItem('preferredSystem') || 'metric';
        var rawFitnessGoal = localStorage.getItem('fitnessGoal');
        
        if (rawFitnessGoal === 'gain_weight') {
            fitnessGoal = 'gain';
        } else if (rawFitnessGoal === 'lose_weight') {
            fitnessGoal = 'lose';
        } else if (rawFitnessGoal === 'maintain_build') {
            fitnessGoal = 'maintain';
        } else {
            fitnessGoal = 'maintain';
        }
        
    } catch (error) {
        console.log("❌ Error reading localStorage: " + error);
        measurementSystem = 'metric';
        fitnessGoal = 'maintain';
    }
    
    return {
        measurementSystem: measurementSystem,
        fitnessGoal: fitnessGoal
    };
}

function manualTest(measurementSystem, fitnessGoal) {
    console.log("🧪 MANUAL TEST: " + measurementSystem + " + " + fitnessGoal);
    localStorage.setItem('preferredSystem', measurementSystem);
    
    // Convert fitness goal to the format expected by localStorage
    var goalValue = fitnessGoal;
    if (fitnessGoal === 'gain') {
        goalValue = 'gain_weight';
    } else if (fitnessGoal === 'lose') {
        goalValue = 'lose_weight';
    } else if (fitnessGoal === 'maintain') {
        goalValue = 'maintain_build';
    }
    
    localStorage.setItem('fitnessGoal', goalValue);
    console.log("💾 Set localStorage: preferredSystem=" + measurementSystem + ", fitnessGoal=" + goalValue);
    window.location.reload(); // Reload to see immediate effect
}

// Backup verification after page loads (just for logging)
document.addEventListener("DOMContentLoaded", function() {
    console.log("🔥 CHOOSE YOUR PLAN - VERIFICATION STARTING 🔥");
    
    setTimeout(function() {
        verifyPageState();
    }, 500);
});

// Make functions available globally on window
window.testPlanLogic = {
    verifyPageState: verifyPageState,
    getUserOnboardingData: getUserOnboardingData,
    manualTest: manualTest
};

// Also make individual functions available directly for easier testing
window.verifyPageState = verifyPageState;
window.manualTest = manualTest;
</script>

<!-- STEP 1: User Data Compilation for Supabase (CORRECTED VERSION) -->
<script>
(function() {
    "use strict";
    
    function compileUserData() {
        console.log("🔥 COMPILING USER DATA FOR SUPABASE 🔥");
        
        try {
            // Get all stored onboarding data
            const rawData = {
                gender: localStorage.getItem('gender'),
                age: localStorage.getItem('age'),
                height: localStorage.getItem('height'),
                weight: localStorage.getItem('weight'),
                targetWeight: localStorage.getItem('targetWeight'),
                activityLevel: localStorage.getItem('activityLevel'),
                fitnessGoal: localStorage.getItem('fitnessGoal'),
                measurementSystem: localStorage.getItem('preferredSystem'),
                dietPreference: localStorage.getItem('dietPreference'),
                dietPreferenceCustom: localStorage.getItem('dietPreferenceCustom'),
                weeklyWeightGoal: localStorage.getItem('weeklyWeightGoal'),
                calculatedTDEE: localStorage.getItem('calculatedTDEE'),
                userProfile: localStorage.getItem('userProfile')
            };
            
            console.log("📊 Raw data collected:", rawData);
            
            // Parse user profile if it exists
            let parsedProfile = null;
            try {
                parsedProfile = rawData.userProfile ? JSON.parse(rawData.userProfile) : null;
            } catch (e) {
                console.warn("Could not parse user profile:", e);
            }
            
            // Convert measurements to metric for database storage
            let heightCm = parseFloat(rawData.height) || 0;
            let weightKg = parseFloat(rawData.weight) || 0;
            let targetWeightKg = parseFloat(rawData.targetWeight) || 0;
            
            if (rawData.measurementSystem === 'imperial') {
                console.log("🔄 Converting imperial measurements to metric");
                // Height: inches to cm
                heightCm = heightCm * 2.54;
                // Weight: lbs to kg
                weightKg = weightKg * 0.453592;
                targetWeightKg = targetWeightKg * 0.453592;
            }
            
            // Calculate macros based on TDEE and fitness goal
            const tdee = parseInt(rawData.calculatedTDEE) || 2000;
            let calorieGoal = tdee;
            
            // Adjust calories based on fitness goal
            if (rawData.fitnessGoal === 'lose_weight') {
                calorieGoal = tdee - 300; // 300 calorie deficit
            } else if (rawData.fitnessGoal === 'gain_weight') {
                calorieGoal = tdee + 300; // 300 calorie surplus
            }
            
            // Calculate macros (example ratios - adjust as needed)
            const proteinGrams = Math.round((calorieGoal * 0.30) / 4); // 30% protein
            const carbGrams = Math.round((calorieGoal * 0.40) / 4);     // 40% carbs
            const fatGrams = Math.round((calorieGoal * 0.30) / 9);      // 30% fat
            
            // Store FULL raw data for future use (when table is expanded)
            const fullRawData = {
                gender: rawData.gender,
                age: parseInt(rawData.age) || 25,
                height: rawData.height,
                weight: rawData.weight,
                targetWeight: rawData.targetWeight,
                activityLevel: rawData.activityLevel,
                fitnessGoal: rawData.fitnessGoal,
                measurementSystem: rawData.measurementSystem,
                dietPreference: rawData.dietPreference,
                dietPreferenceCustom: rawData.dietPreferenceCustom,
                weeklyWeightGoal: rawData.weeklyWeightGoal,
                calculatedTDEE: rawData.calculatedTDEE,
                heightCm: heightCm,
                weightKg: weightKg,
                targetWeightKg: targetWeightKg,
                calorieGoal: calorieGoal,
                proteinGrams: proteinGrams,
                carbGrams: carbGrams,
                fatGrams: fatGrams
            };
            
                 // EXPANDED SUPABASE DATA - Now includes ALL onboarding fields
            	const supabaseData = {
                // Basic info (matching your exact table structure)
                phone_number: null, // Will be collected later or left null
                first_name: null, // Will be collected from Stripe
                last_name: null, // Will be collected from Stripe
                gender: rawData.gender || 'male',
                age: parseInt(rawData.age) || 25,

                // Physical measurements (converted to metric, rounded to integers for smallint)
                height_cm: Math.round(heightCm),
                weight_kg: Math.round(weightKg),

                // Activity and goals
                activity_level: rawData.activityLevel || 'active',
                kcal_goal: calorieGoal,
                prot_goal: proteinGrams,
                carb_goal: carbGrams,
                fat_goal: fatGrams,

                // NEW EXPANDED FIELDS - capturing all missing onboarding data
                target_weight_kg: Math.round(targetWeightKg) || null,
                fitness_goal: rawData.fitnessGoal || null,
                measurement_system: rawData.measurementSystem || null,
                diet_preference: rawData.dietPreference || null,
                diet_preference_custom: rawData.dietPreferenceCustom || null,
                weekly_weight_goal: parseFloat(rawData.weeklyWeightGoal) || null,

                // Timestamp - will be auto-generated by Supabase if not provided
                created_at: new Date().toISOString()
            };
            
            const compiledUserData = {
                fullRawData: fullRawData,
                supabaseData: supabaseData
            };
            
            console.log("✅ Compiled user data:", compiledUserData);
            console.log("🔥 Supabase-ready data:", compiledUserData.supabaseData);
            console.log("📋 Full raw data preserved:", compiledUserData.fullRawData);
            
            // Store compiled data for later use
            localStorage.setItem('compiledUserData', JSON.stringify(compiledUserData));
            localStorage.setItem('supabaseReadyData', JSON.stringify(compiledUserData.supabaseData));
            
            // Also store a flag that data is ready
            localStorage.setItem('dataReadyForSupabase', 'true');
            
            console.log("💾 User data compiled and stored for Supabase insertion");
            
            return compiledUserData;
            
        } catch (error) {
            console.error("❌ Error compiling user data:", error);
            return null;
        }
    }
    
    // Function to get compiled data (for external use)
    window.getCompiledUserData = function() {
        const stored = localStorage.getItem('compiledUserData');
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) {
                console.error("Error parsing compiled user data:", e);
                return null;
            }
        }
        return null;
    };
    
    // Function to clear onboarding data (call after successful DB insert)
    window.clearOnboardingData = function() {
        const keysToRemove = [
            'gender', 'age', 'height', 'weight', 'targetWeight',
            'activityLevel', 'fitnessGoal', 'preferredSystem',
            'dietPreference', 'dietPreferenceCustom', 'weeklyWeightGoal',
            'calculatedTDEE', 'userProfile', 'compiledUserData', 'dataReadyForSupabase'
        ];
        
        keysToRemove.forEach(key => {
            localStorage.removeItem(key);
        });
        
        console.log("🗑️ Onboarding data cleared from localStorage");
    };
    
    // Enhanced data compilation with backup method
function ensureDataCompilation() {
    console.log("🔄 Ensuring data compilation runs...");
    
    // Check if data already exists
    const existingData = localStorage.getItem('compiledUserData');
    if (existingData) {
        console.log("✅ Compiled data already exists");
        return;
    }
    	console.log("No compiled data found, running compilation...");
        const result = compileUserData();

        if (result) {
            console.log("Data compilation successful");
        } else {
            console.log("Data compilation failed, trying backup method...");
          
        
        // Backup: try to compile from userProfile if it exists
        const userProfile = localStorage.getItem('userProfile');
        if (userProfile) {
            try {
                const profile = JSON.parse(userProfile);
                console.log("🔄 Found userProfile, creating compiledUserData from it...");
                
                // Extract the raw data from userProfile
                const backupCompiledData = {
                    fullRawData: {
                        gender: profile.gender || localStorage.getItem('gender'),
                        age: profile.age || localStorage.getItem('age'),
                        height: profile.height || localStorage.getItem('height'),
                        weight: profile.weight || localStorage.getItem('weight'),
                        targetWeight: profile.targetWeight || localStorage.getItem('targetWeight'),
                        activityLevel: profile.activityLevel || localStorage.getItem('activityLevel'),
                        fitnessGoal: profile.fitnessGoal || localStorage.getItem('fitnessGoal'),
                        measurementSystem: profile.measurementSystem || localStorage.getItem('preferredSystem'),
                        dietPreference: profile.dietPreference || localStorage.getItem('dietPreference'),
                        dietPreferenceCustom: profile.dietPreferenceCustom || localStorage.getItem('dietPreferenceCustom'),
                        weeklyWeightGoal: profile.weeklyWeightGoal || localStorage.getItem('weeklyWeightGoal'),
                        calculatedTDEE: profile.tdee || localStorage.getItem('calculatedTDEE'),
                        heightCm: profile.heightCm,
                        weightKg: profile.weightKg,
                        targetWeightKg: profile.targetWeightKg,
                        calorieGoal: profile.tdee,
                        proteinGrams: Math.round((profile.tdee * 0.30) / 4),
                        carbGrams: Math.round((profile.tdee * 0.40) / 4),
                        fatGrams: Math.round((profile.tdee * 0.30) / 9)
                    },
                    supabaseData: {
                        phone_number: null,
                        first_name: null,
                        last_name: null,
                        gender: profile.gender || 'male',
                        age: parseInt(profile.age) || 25,
                        height_cm: Math.round(profile.heightCm || 175),
                        weight_kg: Math.round(profile.weightKg || 70),
                        activity_level: profile.activityLevel || 'active',
                        kcal_goal: profile.tdee || 2000,
                        prot_goal: Math.round((profile.tdee * 0.30) / 4) || 150,
                        carb_goal: Math.round((profile.tdee * 0.40) / 4) || 200,
                        fat_goal: Math.round((profile.tdee * 0.30) / 9) || 67,
                        target_weight_kg: Math.round(profile.targetWeightKg) || null,
                        fitness_goal: profile.fitnessGoal || null,
                        measurement_system: profile.measurementSystem || null,
                        diet_preference: profile.dietPreference || null,
                        diet_preference_custom: profile.dietPreferenceCustom || null,
                        weekly_weight_goal: parseFloat(profile.weeklyWeightGoal) || null,
                        created_at: new Date().toISOString()
                    }
                };
                
                localStorage.setItem('compiledUserData', JSON.stringify(backupCompiledData));
                localStorage.setItem('supabaseReadyData', JSON.stringify(backupCompiledData.supabaseData));
                localStorage.setItem('dataReadyForSupabase', 'true');
                console.log("✅ Backup compilation successful");
                
            } catch (e) {
                console.error("❌ Backup compilation failed:", e);
            }
        }
    }
}

// Run compilation check
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureDataCompilation);
} else {
    ensureDataCompilation();
}

// Make functions available globally for testing
window.compileUserData = compileUserData;
window.ensureDataCompilation = ensureDataCompilation;
    
})();
</script>

<!-- PART 2: ADD MY STRIPE CODE BELOW (NEW) -->

<!-- Load Stripe.js Library -->
<script src="https://js.stripe.com/v3/"></script>

<script>
(function() {
    "use strict";
    
    console.log("🚀 IQCalorie Stripe Checkout Integration - Step 1 Starting");
    
    // Stripe Configuration
    const STRIPE_CONFIG = {
        publishableKey: "pk_live_51RkLeiEUy9uD09G3oBQUBejzZW6dKRC0UocZnyEuv0KBWZyIu8sPY1R12Hc4oLBcq0aluzQSyuLQIp10vzRxUYXU00JOpHsi97",
        priceIds: {
            yearly: "price_1Ru9e5EUy9uD09G3KqXCTFpB",
            monthly: "price_1Ru9ezEUy9uD09G3ik4jyASa"
        }
    };
    
    // Button Selectors
    const BUTTON_SELECTORS = {
        yearly: "#animatedButton",
        monthly: "#monthlyButton"
    };
    
    console.log("📋 Stripe Config:", STRIPE_CONFIG);
    console.log("🎯 Button Selectors:", BUTTON_SELECTORS);
    
    // Initialize Stripe
    let stripe = null;
    
    function initializeStripe() {
        console.log("🔧 Initializing Stripe with publishable key...");
        
        try {
            stripe = Stripe(STRIPE_CONFIG.publishableKey);
            console.log("✅ Stripe initialized successfully:", stripe);
            return true;
        } catch (error) {
            console.error("❌ Stripe initialization failed:", error);
            return false;
        }
    }
    
    // Get compiled user data
    function getCompiledUserData() {
        console.log("📊 Attempting to retrieve compiled user data...");
        
        try {
            const compiledDataStr = localStorage.getItem('compiledUserData');
            const supabaseDataStr = localStorage.getItem('supabaseReadyData');
            
            console.log("📦 Raw compiled data string:", compiledDataStr ? "Found" : "Not found");
            console.log("📦 Raw supabase data string:", supabaseDataStr ? "Found" : "Not found");
            
            if (!compiledDataStr) {
                console.warn("⚠️ No compiled user data found in localStorage");
                return null;
            }
            
            const compiledData = JSON.parse(compiledDataStr);
            console.log("✅ Successfully parsed compiled user data:", compiledData);
            
            return compiledData;
            
        } catch (error) {
            console.error("❌ Error retrieving user data:", error);
            return null;
        }
    }
    
// SIMPLE FIX - Store metadata separately and include customer email
async function redirectToCheckout(planType) {
    console.log(`💳 Starting checkout redirect for plan: ${planType}`);
    
    // Get phone and email from localStorage (for pre-filling only)
    const phoneNumber = localStorage.getItem('userPhone');
    const email = localStorage.getItem('userEmail');
    
    console.log("📱 Phone from localStorage:", phoneNumber || "Will collect in Stripe");
    console.log("📧 Email from localStorage:", email || "Will collect in Stripe");
    
    // Validate Stripe initialization
    if (!stripe) {
        console.error("❌ Stripe not initialized");
        alert("Payment system not ready. Please refresh the page and try again.");
        return;
    }
    
    // Get price ID
    const priceId = STRIPE_CONFIG.priceIds[planType];
    if (!priceId) {
        console.error(`❌ No price ID found for plan type: ${planType}`);
        alert("Invalid plan selected. Please try again.");
        return;
    }
    
    console.log(`🎯 Using price ID: ${priceId} for plan: ${planType}`);
    
    // Get user data
    const userData = getCompiledUserData();
    console.log("👤 User data retrieved:", userData ? "Found" : "Not found (will use defaults)");
    
    // Create checkout key
    const checkoutData = {
        planType: planType,
        userData: userData,
        timestamp: new Date().getTime()
    };
    
    const checkoutKey = `checkout_${checkoutData.timestamp}`;
    localStorage.setItem(checkoutKey, JSON.stringify(checkoutData));
    localStorage.setItem('latest_checkout_key', checkoutKey);
    
    console.log("💾 Stored checkout data for webhook retrieval:", checkoutKey);
    
    try {
        console.log("📞 Calling backend to create checkout session...");
        
        const response = await fetch('https://bass-ethical-piranha.ngrok-free.app/create-checkout-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                priceId: priceId,
                checkoutKey: checkoutKey,
                phoneNumber: phoneNumber,  // For pre-filling
                email: email               // For pre-filling
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to create checkout session');
        }
        
        const data = await response.json();
        console.log("✅ Got session ID from backend:", data.sessionId);
        
        // Redirect to Stripe Checkout
        const result = await stripe.redirectToCheckout({ 
            sessionId: data.sessionId 
        });
        
        if (result.error) {
            console.error("❌ Redirect error:", result.error);
            alert(result.error.message);
        }
        
    } catch (error) {
        console.error("❌ Error creating checkout session:", error);
        alert("Error processing payment. Please try again.");
    }
}
    
    // Setup button click handlers
    function setupButtonHandlers() {
        console.log("🎛️ Setting up button click handlers...");
        
        // Find buttons
        const yearlyButton = document.querySelector(BUTTON_SELECTORS.yearly);
        const monthlyButton = document.querySelector(BUTTON_SELECTORS.monthly);
        
        console.log("🔍 Button search results:");
        console.log("  - Yearly button:", yearlyButton ? "Found ✅" : "Not found ❌");
        console.log("  - Monthly button:", monthlyButton ? "Found ✅" : "Not found ❌");
        
        // Setup yearly button
        if (yearlyButton) {
            console.log("⚡ Adding click handler to yearly button");
            
            yearlyButton.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                console.log("🎯 YEARLY BUTTON CLICKED!");
                console.log("📍 Event target:", e.target);
                console.log("📍 Current target:", e.currentTarget);
                
                redirectToCheckout('yearly');
            });
            
            // Visual feedback for debugging
            yearlyButton.style.cursor = 'pointer';
            console.log("👆 Added pointer cursor to yearly button");
            
        } else {
            console.error(`❌ Yearly button not found with selector: ${BUTTON_SELECTORS.yearly}`);
        }
        
        // Setup monthly button
        if (monthlyButton) {
            console.log("⚡ Adding click handler to monthly button");
            
            monthlyButton.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                console.log("🎯 MONTHLY BUTTON CLICKED!");
                console.log("📍 Event target:", e.target);
                console.log("📍 Current target:", e.currentTarget);
                
                redirectToCheckout('monthly');
            });
            
            // Visual feedback for debugging
            monthlyButton.style.cursor = 'pointer';
            console.log("👆 Added pointer cursor to monthly button");
            
        } else {
            console.error(`❌ Monthly button not found with selector: ${BUTTON_SELECTORS.monthly}`);
        }
        
        // Debug: Show all available buttons on page
        const allButtons = document.querySelectorAll('button, [role="button"], .button, [id*="button"], [id*="Button"]');
        console.log("🔍 ALL BUTTONS/CLICKABLE ELEMENTS FOUND ON PAGE:");
        allButtons.forEach((btn, index) => {
            console.log(`  ${index + 1}. ID: "${btn.id}", Classes: "${btn.className}", Text: "${btn.textContent?.trim().substring(0, 30)}"`);
        });
    }
    
    // Initialize everything
    function initialize() {
        console.log("🚀 Starting IQCalorie Stripe Checkout initialization...");
        
        // Step 1: Initialize Stripe
        if (!initializeStripe()) {
            console.error("❌ Cannot proceed - Stripe initialization failed");
            return;
        }
        
        // Step 2: Setup button handlers
        setupButtonHandlers();
        
        // Step 3: Test user data retrieval
        const userData = getCompiledUserData();
        if (userData) {
            console.log("✅ User data compilation test: PASSED");
        } else {
            console.warn("⚠️ User data compilation test: NO DATA (this is OK for testing buttons)");
        }
        
        console.log("🎉 Stripe Checkout integration initialization COMPLETE!");
        console.log("🧪 TESTING INSTRUCTIONS:");
        console.log("1. Open DevTools Console");
        console.log("2. Click either the yearly or monthly button");
        console.log("3. Watch console logs for detailed feedback");
        console.log("4. Should redirect to Stripe checkout");
    }
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            console.log("📄 DOM loaded, initializing...");
            // Small delay to ensure ClickFunnels elements are ready
            setTimeout(initialize, 1000);
        });
    } else {
        console.log("📄 DOM already loaded, initializing...");
        // Small delay to ensure ClickFunnels elements are ready
        setTimeout(initialize, 1000);
    }
    
    // Make functions available for manual testing
    window.iqcalorieStripeTest = {
        redirectToCheckout: redirectToCheckout,
        getCompiledUserData: getCompiledUserData,
        reinitialize: initialize,
        stripe: function() { return stripe; }
    };
    
    console.log("🧪 Manual testing functions available:");
    console.log("- window.iqcalorieStripeTest.redirectToCheckout('yearly')");
    console.log("- window.iqcalorieStripeTest.redirectToCheckout('monthly')");
    console.log("- window.iqcalorieStripeTest.getCompiledUserData()");
    console.log("- window.iqcalorieStripeTest.reinitialize()");
    
})();
</script>


<!-- Insert HEADER script for Choose Your Plan -->
<script>
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('preview') === 'true') {
  console.log('Edit mode - bypassing protection');
} else if (!localStorage.getItem('weeklyWeightGoal') || (!document.referrer.includes('iqcalorie.com') && !document.referrer.includes('stripe.com'))) {
  window.location.replace('https://www.iqcalorie.com/landing');
}
</script>


```CSS
<!-- Insert CSS Custom Code for Choose Your Plan -->
```
<!-- Add this script in the CSS Custom Code section of the Choose Your Plan page, not footer -->

/*

#gainWeightMet u{
  color: #ff6600;
  text-decoration: none;
}

#loseWeightMet u{
  color: #ff6600;
  text-decoration: none;
}

#gainWeightImp u{
  color: #ff6600;
  text-decoration: none;
}

#loseWeightImp u{
  color: #ff6600;
  text-decoration: none;
}

#maintainWeight u{
  color: #ff6600;
  text-decoration: none;
}

#animatedButton {
  position: relative;
  display: inline-block;
  left: 50%;
  transform: translate(-50%);
  border-radius: 999px;
  animation: borderPulse 1.2s infinite ease-in-out;
}

@keyframes borderPulse {
  0% {
    box-shadow: 0 0 0px #ff6600;
  }
  50% {
    box-shadow: 0 0 15px #ff6600;
  }
  100% {
    box-shadow: 0 0 0px #ff6600;
  }
}

#annualPlanRow {
  position: relative;
  margin-left: 0;
  padding-right: 0px ;
}

#95off {
  position: absolute;
  padding-right: 10px ;
  top: ;
}

#off {
  margin-right: -60px;
}

#freeTrial2 a{
  background: linear-gradient(135deg, #ff7300, #ffbb00); /* orange to golden-yellow */
  
  }

*/

## 14. Confirmation 

```html
<!-- Insert footer script for Confirmation -->
<script>
(function() {
    "use strict";
    
         console.log("?? CONFIRMATION PAGE - Auto User Setup Starting");

        // Get checkout key and session_id from URL - ENHANCED DEBUGGING
        function getURLParams() {
            console.log("?? DEBUGGING URL PARAMETERS");
            console.log("  - Full URL:", window.location.href);
            console.log("  - Search string:", window.location.search);
            console.log("  - Hash:", window.location.hash);

            // Try multiple methods to get parameters
            const urlParams = new URLSearchParams(window.location.search);

            // Method 1: Standard approach
            let checkoutKey = urlParams.get('checkout_key');
            let sessionId = urlParams.get('session_id');

            console.log("?? Method 1 (standard) results:");
            console.log("  - checkout_key:", checkoutKey);
            console.log("  - session_id:", sessionId);

            // Method 2: Check if parameters exist with different names
            console.log("?? All URL parameters found:");
            for (let [key, value] of urlParams) {
                console.log(`  - ${key}: ${value}`);
            }

            // Method 3: Manual parsing as fallback
            if (!checkoutKey || !sessionId) {
                console.log("?? Trying manual parsing...");
                const searchString = window.location.search.substring(1);
                const params = searchString.split('&');

                params.forEach(param => {
                    const [key, value] = param.split('=');
                    console.log(`  - Found: ${key} = ${decodeURIComponent(value || '')}`);

                    if (key === 'checkout_key') {
                        checkoutKey = decodeURIComponent(value || '');
                    }
                    if (key === 'session_id') {
                        sessionId = decodeURIComponent(value || '');
                    }
                });
            }

            // Method 4: Check if Stripe replaced session_id
            if (sessionId && sessionId === '{CHECKOUT_SESSION_ID}') {
                console.log("?? Stripe placeholder not replaced!");
                sessionId = null;
            }

            console.log("?? FINAL RESULTS:");
            console.log("  - checkoutKey:", checkoutKey || "NOT FOUND");
            console.log("  - sessionId:", sessionId || "NOT FOUND");

            return { checkoutKey, sessionId };
        }

        // Get compiled user data from localStorage
        function getStoredUserData() {
            try {
                const compiledDataStr = localStorage.getItem('compiledUserData');
                if (!compiledDataStr) {
                    console.warn("?? No compiled user data found");
                    return null;
                }

                const compiledData = JSON.parse(compiledDataStr);
                console.log("?? Retrieved user data:", compiledData);
                return compiledData;
            } catch (error) {
                console.error("? Error retrieving user data:", error);
                return null;
            }
        }

        // Get phone number from localStorage (captured on landing page)
        function getPhoneNumber() {
            console.log("?? GETTING PHONE NUMBER FROM LOCALSTORAGE...");

            // Get phone from localStorage (set by landing page script)
            let phone = localStorage.getItem('userPhone');

            console.log("?? Raw phone from localStorage:", phone);

            if (!phone) {
                console.warn("?? No phone number found in localStorage");

                // Debug: Show all localStorage keys
                console.log("?? All localStorage keys:");
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    const value = localStorage.getItem(key);
                    console.log(`  ${key}: ${value}`);
                }

                return null;
            }

            // Clean the phone number (remove any extra spaces, but keep the + and digits)
            phone = phone.replace(/\s+/g, '');

            // Validate that it looks like a phone number
            if (!phone.startsWith('+') || phone.length < 10) {
                console.warn("?? Phone number format looks incorrect:", phone);
                return null;
            }

            console.log("?? Final cleaned phone number:", phone);
            return phone;
        }

        // Create user account via backend
        async function createUserAccount(checkoutKey, sessionId, userData, phoneNumber) {
            console.log("?? Creating user account...");
            console.log("?? DEBUG - Function inputs:");
            console.log("  - checkoutKey:", checkoutKey);
            console.log("  - sessionId:", sessionId);
            console.log("  - phoneNumber:", phoneNumber);
            console.log("  - userData exists?", !!userData);

            // Check if userData.supabaseData exists
            if (!userData) {
                console.error("? userData is null/undefined!");
                userData = {};
            }

            if (!userData.supabaseData) {
                console.warn("?? userData.supabaseData is missing - using defaults");
                userData.supabaseData = {};
            }

            try {
                const requestData = {
                    checkoutKey: checkoutKey,
                    sessionId: sessionId,
                    stripeData: {
                        session_id: sessionId,
                        customer_id: "fetch_from_session",
                        subscription_id: "fetch_from_session"
                    },
                    userData: {
    // Allow phone to be null
    phone_number: phoneNumber || null,
    
    // Basic fields
    gender: userData.supabaseData.gender || "male",
    age: userData.supabaseData.age || 25,
    height_cm: userData.supabaseData.height_cm || 175,
    weight_kg: userData.supabaseData.weight_kg || 70,
    activity_level: userData.supabaseData.activity_level || "active",
    kcal_goal: userData.supabaseData.kcal_goal || 2000,
    prot_goal: userData.supabaseData.prot_goal || 150,
    carb_goal: userData.supabaseData.carb_goal || 200,
    fat_goal: userData.supabaseData.fat_goal || 67,
    
    // NEW EXPANDED FIELDS - Send all missing onboarding data to backend
    target_weight_kg: userData.supabaseData.target_weight_kg || null,
    fitness_goal: userData.supabaseData.fitness_goal || null,
    measurement_system: userData.supabaseData.measurement_system || null,
    diet_preference: userData.supabaseData.diet_preference || null,
    diet_preference_custom: userData.supabaseData.diet_preference_custom || null,
    weekly_weight_goal: userData.supabaseData.weekly_weight_goal || null
                    }
                };

                console.log("?? COMPLETE REQUEST DATA BEING SENT:");
                console.log("  - phoneNumber variable:", phoneNumber);
                console.log("  - userData.phone_number:", requestData.userData.phone_number);
                console.log("  - Complete requestData:", JSON.stringify(requestData, null, 2));

                const backendUrl = 'https://bass-ethical-piranha.ngrok-free.app/complete-user-setup';
                console.log("?? Sending POST request to:", backendUrl);

                // Make the actual request
                const response = await fetch(backendUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestData)
                });

                console.log("?? Response received:");
                console.log("  - Status:", response.status);
                console.log("  - StatusText:", response.statusText);
                console.log("  - OK?", response.ok);

                const result = await response.json();
                console.log("?? Response JSON:", result);

                if (response.ok) {
                    console.log("? User account created successfully:", result);

                    // Clear localStorage after successful creation
                    const keysToRemove = [
                        'compiledUserData', 'supabaseReadyData', 'userPhone',
                        'gender', 'age', 'height', 'weight', 'activityLevel', 
                        'fitnessGoal', 'preferredSystem', 'dietPreference'
                    ];

                    keysToRemove.forEach(key => localStorage.removeItem(key));
                    console.log("??? Cleared user data from localStorage");

                    return result;
                } else {
                    console.error("? Failed to create user account:", result);
                    return null;
                }

            } catch (error) {
                console.error("? Error in createUserAccount:");
                console.error("  - Error name:", error.name);
                console.error("  - Error message:", error.message);
                console.error("  - Full error:", error);
                return null;
            }
        }

        // Trigger WhatsApp welcome message
        async function triggerWhatsAppWelcome(phoneNumber, userData) {
            console.log("?? Triggering WhatsApp welcome message for:", phoneNumber);

            try {
                const welcomeData = {
                    phone: phoneNumber,
                    userData: userData
                };

                console.log("?? Sending welcome trigger with data:", welcomeData);

                const response = await fetch('https://bass-ethical-piranha.ngrok-free.app/trigger-welcome', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(welcomeData)
                });

                const result = await response.json();

                if (response.ok) {
                    console.log("? WhatsApp welcome message triggered successfully:", result);
                    return true;
                } else {
                    console.error("? Failed to trigger WhatsApp welcome:", result);
                    return false;
                }

            } catch (error) {
                console.error("? Error triggering WhatsApp welcome:", error);
                return false;
            }
        }

        // Main execution
        async function initializeUserSetup() {
            console.log("?? Starting automatic user setup...");

            // Get URL parameters
            let { checkoutKey, sessionId } = getURLParams();

            // TEST MODE: If no parameters found, try test values
            if (!checkoutKey && !sessionId) {
                console.log("?? No URL parameters found - checking for test mode");

                // Check if we're in test mode (you can trigger this manually)
                const testMode = localStorage.getItem('testMode') === 'true';

                if (testMode) {
                    console.log("?? TEST MODE ACTIVATED - Using test values");
                    checkoutKey = 'checkout_test_' + Date.now();
                    sessionId = 'cs_test_' + Date.now();

                    // Also test with actual test session if you have one
                    // sessionId = 'cs_test_a1XYZ...'; // Replace with actual test session
                }
            }

            if (!checkoutKey || !sessionId) {
                console.warn("?? Missing checkout key or session ID");
                console.log("?? Current location:", window.location.href);
                console.log("?? Expected format: ?session_id=cs_xxx&checkout_key=checkout_xxx");

                // Don't return - continue to see what else works
                // return;
            }

            // Get user data from localStorage
            const userData = getStoredUserData();
            if (!userData || !userData.supabaseData) {
                console.warn("?? No user data found - will use defaults");
                // Don't return - continue with defaults
            }

            // Get phone number from localStorage (may be null for Test 2)
            const phoneNumber = getPhoneNumber();
            if (!phoneNumber) {
                console.warn("?? No phone number in localStorage - will rely on Stripe");
                // DON'T RETURN - continue with null phone
            }

            // Wait a moment for webhook to process
            console.log("?? Waiting 3 seconds for webhook to process...");
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Create user account (backend will handle missing phone)
            const userResult = await createUserAccount(checkoutKey, sessionId, userData, phoneNumber);

            if (userResult && userResult.user) {
                // Use the phone from the database (Stripe's phone), not localStorage
                const actualPhoneNumber = userResult.user.phone_number;
                console.log("?? Using phone from database (not localStorage):", actualPhoneNumber);

                // Trigger WhatsApp welcome message with correct phone
                if (actualPhoneNumber && !actualPhoneNumber.startsWith('+1000')) {
                    const welcomeResult = await triggerWhatsAppWelcome(actualPhoneNumber, userData);

                    if (welcomeResult) {
                        console.log("?? USER SETUP AND WHATSAPP WELCOME COMPLETE!");
                    } else {
                        console.log("?? User account created but WhatsApp welcome failed");
                    }
                } else {
                    console.log("?? User created but no valid phone for WhatsApp");
                }
            } else {
                console.log("? User setup failed - please contact support");
            }
        }

        // Add test functions for manual debugging
        window.debugConfirmation = {
            checkURL: function() {
                console.log("?? URL Debug:");
                console.log("  Full URL:", window.location.href);
                console.log("  Search:", window.location.search);
                console.log("  Params:", new URLSearchParams(window.location.search).toString());
                return getURLParams();
            },

            testWithFakeParams: function() {
                console.log("?? Testing with fake parameters");
                // Temporarily modify the URL
                const fakeURL = window.location.origin + window.location.pathname + 
                               "?session_id=cs_test_123&checkout_key=checkout_test_456";
                console.log("  Fake URL:", fakeURL);

                // Store test mode flag
                localStorage.setItem('testMode', 'true');

                // Reload with fake params
                if (confirm("Reload page with test parameters?")) {
                    window.location.href = fakeURL;
                }
            },

            runManually: async function() {
                console.log("?? Running user setup manually");
                await initializeUserSetup();
            }
        };

        console.log("?? Debug functions available:");
        console.log("  window.debugConfirmation.checkURL()");
        console.log("  window.debugConfirmation.testWithFakeParams()");
        console.log("  window.debugConfirmation.runManually()");

        // Start when page loads
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeUserSetup);
        } else {
            initializeUserSetup();
        }

        console.log("?? Auto user setup script loaded");
    
})();
</script>


<!-- Insert HEADER script for Confirmation -->
 <script>
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('preview') === 'true') {
  console.log('Edit mode - bypassing protection');
} else if (!localStorage.getItem('dataReadyForSupabase')) {
  window.location.replace('https://www.iqcalorie.com/landing');
}
</script>


<!-- Insert CSS FOOTER script for Confirmation -->
.timeline-line {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 10px;
}

#timeline-step1 {
  width: 12px;
  height: 12px;
  background-color: #FF6600; /* orange dot */
  border-radius: 50%;
  margin: 50px 0px 10px;
}

#timeline-step2 {
  width: 12px;
  height: 12px;
  background-color: #FF6600; /* orange dot */
  border-radius: 50%;
  margin: 10px 0px 10px;
}

#timeline-step2 {
  width: 12px;
  height: 12px;
  background-color: #FF6600; /* orange dot */
  border-radius: 50%;
  margin: 10px 0px 10px;
}

#timeline-step3 {
  width: 12px;
  height: 12px;
  background-color: #FF6600; /* orange dot */
  border-radius: 50%;
  margin: 10px 0px 10px;
}

#timeline-step4 {
  width: 12px;
  height: 12px;
  background-color: #FF6600; /* orange dot */
  border-radius: 50%;
  margin: 10px 0px 10px;
}

.timeline-connector {
  width: 2px;
  height: 115px;
  background-color: #FF6600;
}

.gradient-line {
  height: 2px;
  width: 100%;
  background: linear-gradient(to right, #ff6600, rgba(255, 102, 0, 0));
  margin-top: 23px; /* adjust to align with headline */
}

#button1, #button2, #button3, #button4 {
  margin-right: -0px;
}

@media screen and (max-width: 768px) {
  .timeline-line {
    display: none;
  }
}

#openWhatsapp {
  padding: 5px 32px;
  color: white;
  font-weight: bold;
  font-size: 16px;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  overflow: hidden;
  background: linear-gradient(135deg, #4A00E0, #8E2DE2); /* blue to purple */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  text-align: center;
}

/* Shine Animation */
#openWhatsapp::before {
  content: '';
  position: absolute;
  top: 0;
  left: -75%;
  width: 50%;
  height: 100%;
  background: linear-gradient(
    120deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.4) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  transform: skewX(-20deg);
  animation: shine 2.5s infinite;
  pointer-events: none; /* So it doesn't interfere with clicks */
}

@keyframes shine {
  0% {
    left: -75%;
  }
  100% {
    left: 125%;
  }
}

#proTip i{
  color: #ff6600;
}

#proTipRow {
  margin-left: 5px;
}

#accountActivated a {
  background: linear-gradient(135deg, #ff7300, #ffbb00); /* orange to golden-yellow */
  
}

## 15. User Dashboard

```html
<!-- Insert footer script for User Dashboard -->
```
<script>
(function() {
  'use strict';
  
  // Configuration
  const API_BASE = 'https://bass-ethical-piranha.ngrok-free.app';
  
  // Field mapping: display label → database column
  const FIELD_MAP = {
    'First Name': 'first_name',
    'Last Name': 'last_name',
    'Email': 'email',
    'Phone': 'phone_number',
    'Gender': 'gender',
    'Age': 'age',
    'Height (cm)': 'height_cm',
    'Weight (kg)': 'weight_kg',
    'Target Weight (kg)': 'target_weight_kg',
    'Measurement System': 'measurement_system',
    'Activity Level': 'activity_level',
    'Fitness Goal': 'fitness_goal',
    'Diet Preference': 'diet_preference',
    'Custom Diet Preference': 'diet_preference_custom',
    'Weekly Weight Goal (kg)': 'weekly_weight_goal',
    'Calories Goal': 'kcal_goal',
    'Protein Goal (g)': 'prot_goal',
    'Carbs Goal (g)': 'carb_goal',
    'Fat Goal (g)': 'fat_goal',
    'Status': 'stripe_subscription_id',
    'Stripe Customer ID': 'stripe_customer_id',
    'Stripe Subscription ID': 'stripe_subscription_id',
    'Date Joined': 'created_at'
  };
  
  // Field sections for organization
  const SECTIONS = {
    'Personal Info': ['First Name', 'Last Name', 'Email', 'Phone', 'Gender', 'Age'],
    'Physical Stats': ['Height (cm)', 'Weight (kg)', 'Target Weight (kg)', 'Measurement System', 'Activity Level'],
    'Goals': ['Fitness Goal', 'Diet Preference', 'Custom Diet Preference', 'Weekly Weight Goal (kg)'],
    'Target Macros': ['Calories Goal', 'Protein Goal (g)', 'Carbs Goal (g)', 'Fat Goal (g)'],
    'Subscription & Metadata': ['Status', 'Stripe Customer ID', 'Stripe Subscription ID', 'Date Joined']
  };
  
  // Read-only fields
  const READONLY_FIELDS = ['Phone', 'Status', 'Stripe Customer ID', 'Stripe Subscription ID', 'Date Joined'];
  
  // Select options for dropdown fields
  const SELECT_OPTIONS = {
    'gender': [
      { value: 'male', text: 'Male' },
      { value: 'female', text: 'Female' }
    ],
    'measurement_system': [
      { value: 'metric', text: 'Metric' },
      { value: 'imperial', text: 'Imperial' }
    ],
    'activity_level': [
      { value: 'sedentary', text: 'Sedentary' },
      { value: 'lightly_active', text: 'Lightly Active' },
      { value: 'moderately_active', text: 'Moderately Active' },
      { value: 'very_active', text: 'Very Active' },
      { value: 'active', text: 'Active' }
    ],
    'fitness_goal': [
      { value: 'lose_weight', text: 'Lose Weight' },
      { value: 'maintain_weight', text: 'Maintain Weight' },
      { value: 'gain_weight', text: 'Gain Weight' }
    ],
    'diet_preference': [
  { value: 'everything', text: 'Everything' },
  { value: 'mediterranean', text: 'Mediterranean' },
  { value: 'keto', text: 'Keto' },
  { value: 'paleo', text: 'Paleo' },
  { value: 'vegan', text: 'Vegan' },
  { value: 'dash', text: 'DASH' },
  { value: 'lowCarb', text: 'Low Carb' },
  { value: 'intermittentFasting', text: 'Intermittent Fasting' },
  { value: 'glutenFree', text: 'Gluten-Free' },
  { value: 'flexitarian', text: 'Flexitarian' },
  { value: 'other', text: 'Other' }
]
  };
  
  let userData = {};
  let currentUserPhone = null;
  
  // Get user phone from URL parameter
  function getUserPhone() {
    const urlParams = new URLSearchParams(window.location.search);
    const phoneFromUrl = urlParams.get('phone');
    
    if (phoneFromUrl) {
      console.log('📱 Phone from URL:', phoneFromUrl);
      return phoneFromUrl;
    }
    
    return null;
  }
  
  // Initialize dashboard
  function init() {
    console.log('🚀 Dashboard initializing...');
    
    setTimeout(function() {
      const container = document.getElementById('iqc-dashboard');
      if (!container) {
        console.error('❌ Dashboard container not found');
        const backupContainer = document.querySelector('.iqc-scope');
        if (backupContainer) {
          backupContainer.id = 'iqc-dashboard';
          console.log('✅ Found backup container');
        } else {
          console.error('❌ No container found at all');
          return;
        }
      }
      
      currentUserPhone = getUserPhone();
      if (!currentUserPhone) {
        container.innerHTML = '<div class="iqc-error">Invalid access. Please use the dashboard link from your WhatsApp chat.</div>';
        return;
      }
      
      console.log('📱 Using phone:', currentUserPhone);
      loadUser();
    }, 1000);
  }
  
// Load user data from API
  async function loadUser() {
    const container = document.getElementById('iqc-dashboard');
    container.innerHTML = '<div class="iqc-loading">Loading profile...</div>';
    
    try {
      console.log('🔍 DEBUG: currentUserPhone variable =', currentUserPhone);
      console.log('🔄 Fetching user data from:', API_BASE + '/api/user/' + encodeURIComponent(currentUserPhone));
      
      const response = await fetch(API_BASE + '/api/user/' + encodeURIComponent(currentUserPhone), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('📡 Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Response error:', errorText);
        throw new Error('Failed to load user data: ' + response.status);
      }
      
      const data = await response.json();
      console.log('✅ User data received:', data);
      userData = data.user || {};
      
      renderDashboard();
    } catch (error) {
      console.error('Error loading user:', error);
      container.innerHTML = '<div class="iqc-error">Error loading profile: ' + error.message + '</div>';
    }
  }
  
  // Render the dashboard
  function renderDashboard() {
    const container = document.getElementById('iqc-dashboard');
    
    let html = '<div class="iqc-header"><h1 class="iqc-title">Profile Dashboard</h1><p class="iqc-subtitle">View and edit your profile information</p></div>';
    
    // Render each section
    Object.entries(SECTIONS).forEach(function(entry) {
      const sectionName = entry[0];
      const fields = entry[1];
      
      html += '<div class="iqc-section"><h3 class="iqc-section-title">' + sectionName + '</h3>';
      
      fields.forEach(function(fieldLabel) {
  const fieldKey = FIELD_MAP[fieldLabel];
  if (!fieldKey || userData[fieldKey] === undefined) return;
  
  // Special handling for Custom Diet Preference - only show if diet preference is 'other'
  if (fieldLabel === 'Custom Diet Preference') {
    const dietPreference = userData['diet_preference'];
    if (!dietPreference || dietPreference !== 'other') {
      return; // Skip this field if diet preference is not 'other'
    }
  }
  
  const isReadonly = READONLY_FIELDS.includes(fieldLabel);
  const value = formatFieldValue(fieldKey, userData[fieldKey]);
  
  html += '<div class="iqc-row" data-field="' + fieldKey + '">' +
          '<div class="iqc-label">' + fieldLabel + ':</div>' +
          '<div class="iqc-value">' + (isReadonly ? '<span class="iqc-readonly">' + value + '</span>' : value) + '</div>' +
          '<div class="iqc-actions">' +
          (!isReadonly ? '<button class="iqc-edit-btn" aria-label="Edit ' + fieldLabel + '">Edit</button>' : '') +
          '</div></div>';
});
      
      html += '</div>';
    });
    
    // Add billing portal button at the end
    html += `
      <div class="iqc-billing-section">
        <button id="iqc-billing-btn" class="iqc-billing-button">
          Manage Subscription & Billing
        </button>
        <div id="iqc-billing-loading" class="iqc-billing-loading" style="display: none;">
          Loading billing portal...
        </div>
        <div id="iqc-billing-error" class="iqc-billing-error" style="display: none;"></div>
      </div>
    `;
    
    container.innerHTML = html;
    
    // Add event listeners
    addEventListeners();
  }
  
  // Format field values for display
  function formatFieldValue(fieldKey, value) {
    if (value === null || value === undefined || value === '') {
      return '<em>Not set</em>';
    }
    
    switch (fieldKey) {
      case 'stripe_subscription_id':
        return value ? 'Active' : 'Inactive';
      case 'created_at':
        return new Date(value).toLocaleDateString();
      case 'measurement_system':
        return value === 'metric' ? 'Metric' : 'Imperial';
      case 'gender':
        return value.charAt(0).toUpperCase() + value.slice(1);
      case 'activity_level':
        return value.replace(/_/g, ' ').replace(/\\b\\w/g, function(l) { return l.toUpperCase(); });
      case 'fitness_goal':
        return value.replace(/_/g, ' ').replace(/\\b\\w/g, function(l) { return l.toUpperCase(); });
      case 'diet_preference':
        // Handle special cases first
        if (value === 'lowCarb') return 'Low Carb';
        if (value === 'intermittentFasting') return 'Intermittent Fasting';
        if (value === 'glutenFree') return 'Gluten-Free';
        if (value === 'dash') return 'DASH';
        if (value === 'other') return 'Other';
        // Handle regular cases
        return value.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });
      default:
        return String(value);
    }
  }
  
  // Add event listeners
  function addEventListeners() {
    const container = document.getElementById('iqc-dashboard');
    
    // Billing portal button click
    container.addEventListener('click', function(e) {
      if (e.target.id === 'iqc-billing-btn') {
        handleBillingPortal();
        return;
      }
    });
    
    // Edit button clicks
    container.addEventListener('click', function(e) {
      if (e.target.classList.contains('iqc-edit-btn')) {
        const row = e.target.closest('.iqc-row');
        const fieldKey = row.dataset.field;
        enterEdit(fieldKey);
      }
      
      if (e.target.classList.contains('iqc-save-btn')) {
        const row = e.target.closest('.iqc-row');
        const fieldKey = row.dataset.field;
        const input = row.querySelector('.iqc-input, .iqc-select');
        saveField(fieldKey, input.value);
      }
      
      if (e.target.classList.contains('iqc-cancel-btn')) {
        const row = e.target.closest('.iqc-row');
        const fieldKey = row.dataset.field;
        exitEdit(fieldKey);
      }
    });
    
    container.addEventListener('keydown', function(e) {
      if (e.target.classList.contains('iqc-input') || e.target.classList.contains('iqc-select')) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const row = e.target.closest('.iqc-row');
          const fieldKey = row.dataset.field;
          saveField(fieldKey, e.target.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          const row = e.target.closest('.iqc-row');
          const fieldKey = row.dataset.field;
          exitEdit(fieldKey);
        }
      }
    });
  }
  
  // Enter edit mode for a field
  function enterEdit(fieldKey) {
    const row = document.querySelector('[data-field="' + fieldKey + '"]');
    const valueDiv = row.querySelector('.iqc-value');
    const actionsDiv = row.querySelector('.iqc-actions');
    
    const currentValue = userData[fieldKey] || '';
    const selectOptions = SELECT_OPTIONS[fieldKey];
    
    let inputHtml;
    if (selectOptions) {
      inputHtml = '<select class="iqc-select">';
      selectOptions.forEach(function(option) {
        const selected = option.value === currentValue ? 'selected' : '';
        inputHtml += '<option value="' + option.value + '" ' + selected + '>' + option.text + '</option>';
      });
      inputHtml += '</select>';
    } else {
      const inputType = isNumberField(fieldKey) ? 'number' : 'text';
      inputHtml = '<input type="' + inputType + '" class="iqc-input" value="' + currentValue + '" />';
    }
    
    valueDiv.innerHTML = inputHtml;
    actionsDiv.innerHTML = '<button class="iqc-save-btn">Save</button><button class="iqc-cancel-btn">Cancel</button>';
    
    const input = valueDiv.querySelector('.iqc-input, .iqc-select');
    if (input) {
      input.focus();
      if (input.type === 'text') {
        input.select();
      }
    }
  }
  
  // Exit edit mode
  function exitEdit(fieldKey) {
    const row = document.querySelector('[data-field="' + fieldKey + '"]');
    const valueDiv = row.querySelector('.iqc-value');
    const actionsDiv = row.querySelector('.iqc-actions');
    
    const value = formatFieldValue(fieldKey, userData[fieldKey]);
    valueDiv.innerHTML = value;
    actionsDiv.innerHTML = '<button class="iqc-edit-btn" aria-label="Edit ' + fieldKey + '">Edit</button>';
  }
  
  // Save field value
  async function saveField(fieldKey, newValue) {
    const row = document.querySelector('[data-field="' + fieldKey + '"]');
    
    if (isNumberField(fieldKey)) {
      const numValue = parseFloat(newValue);
      if (isNaN(numValue) || numValue < 0) {
        showError(row, 'Please enter a valid positive number');
        return;
      }
      newValue = numValue;
    }
    
    const existingError = row.querySelector('.iqc-error');
    if (existingError) {
      existingError.remove();
    }
    
    try {
      console.log('💾 Saving field:', fieldKey, '=', newValue);
      
      const requestBody = {};
      requestBody[fieldKey] = newValue;
      
      const response = await fetch(API_BASE + '/api/user/' + encodeURIComponent(currentUserPhone), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log('📡 Save response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Save error:', errorText);
        throw new Error('Update failed: ' + response.status);
      }
      
      const data = await response.json();
      console.log('✅ Save successful:', data);
      
      userData[fieldKey] = newValue;
exitEdit(fieldKey);
toast('Profile updated successfully', 'success');

// If diet preference was changed, re-render dashboard to show/hide custom diet preference field
if (fieldKey === 'diet_preference') {
  console.log('🔄 Diet preference changed, re-rendering dashboard...');
  
  // Clear custom diet preference if user switched away from "other"
  if (newValue !== 'other' && userData['diet_preference_custom']) {
    console.log('🧹 Clearing custom diet preference since diet preference is no longer "other"');
    
    // Clear it in the database
    fetch(API_BASE + '/api/user/' + encodeURIComponent(currentUserPhone), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        diet_preference_custom: null
      })
    }).then(function(response) {
      if (response.ok) {
        console.log('✅ Custom diet preference cleared in database');
        userData['diet_preference_custom'] = null;
      }
    }).catch(function(error) {
      console.error('❌ Failed to clear custom diet preference:', error);
    });
  }
  
  setTimeout(function() {
    renderDashboard();
  }, 500);
}
      
    } catch (error) {
      console.error('Error saving field:', error);
      showError(row, 'Failed to save: ' + error.message);
    }
  }
  
  // Check if field should be treated as number
  function isNumberField(fieldKey) {
    return ['age', 'height_cm', 'weight_kg', 'target_weight_kg', 'weekly_weight_goal', 'kcal_goal', 'prot_goal', 'carb_goal', 'fat_goal'].includes(fieldKey);
  }
  
  // Show inline error
  function showError(row, message) {
    let errorDiv = row.querySelector('.iqc-error');
    if (!errorDiv) {
      errorDiv = document.createElement('div');
      errorDiv.className = 'iqc-error';
      row.appendChild(errorDiv);
    }
    errorDiv.textContent = message;
  }
  
  // Show toast notification
  function toast(message, type) {
    type = type || 'success';
    const toast = document.createElement('div');
    toast.className = 'iqc-toast ' + type;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(function() { 
      toast.classList.add('show'); 
    }, 100);
    
    setTimeout(function() {
      toast.classList.remove('show');
      setTimeout(function() {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }
  
  // Handle billing portal button click
  async function handleBillingPortal() {
    const billingBtn = document.getElementById('iqc-billing-btn');
    const loadingDiv = document.getElementById('iqc-billing-loading');
    const errorDiv = document.getElementById('iqc-billing-error');
    
    // Show loading state
    billingBtn.disabled = true;
    billingBtn.textContent = 'Loading...';
    loadingDiv.style.display = 'block';
    errorDiv.style.display = 'none';
    
    try {
      console.log('🔗 Requesting billing portal for:', currentUserPhone);
      
      const response = await fetch(API_BASE + '/api/billing-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone_number: currentUserPhone
        })
      });
      
      const data = await response.json();
      
      if (data.success && data.url) {
        console.log('✅ Billing portal URL received');
        // Open billing portal in new tab
        window.open(data.url, '_blank');
      } else {
        throw new Error(data.message || 'Failed to create billing portal');
      }
      
    } catch (error) {
      console.error('❌ Billing portal error:', error);
      let errorMessage = 'Unable to access billing portal. Please try again.';
      
      if (error.message && error.message.includes('not set up')) {
        errorMessage = 'Billing portal is not available yet. Please contact support for subscription management.';
      }
      
      errorDiv.textContent = errorMessage;
      errorDiv.style.display = 'block';
    } finally {
      // Reset button state
      billingBtn.disabled = false;
      billingBtn.textContent = 'Manage Subscription & Billing';
      loadingDiv.style.display = 'none';
    }
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
</script>

<!-- Insert CSS script for User Dashboard -->
.iqc-scope {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
}

.iqc-scope .iqc-header {
  margin-bottom: 30px;
  text-align: center;
}

.iqc-scope .iqc-title {
  font-size: 24px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0 0 10px 0;
}

.iqc-scope .iqc-subtitle {
  color: #6c757d;
  margin: 0;
}

.iqc-scope .iqc-section {
  background: white;
  margin-bottom: 20px;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.iqc-scope .iqc-section-title {
  background: #e9ecef;
  padding: 12px 16px;
  font-weight: 600;
  color: #495057;
  margin: 0;
  font-size: 16px;
}

.iqc-scope .iqc-row {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #dee2e6;
  min-height: 48px;
}

.iqc-scope .iqc-row:last-child {
  border-bottom: none;
}

.iqc-scope .iqc-label {
  flex: 1;
  font-weight: 500;
  color: #495057;
}

.iqc-scope .iqc-value {
  flex: 2;
  color: #212529;
}

.iqc-scope .iqc-actions {
  flex: 0 0 auto;
  margin-left: 10px;
}

.iqc-scope .iqc-edit-btn {
  background: #007bff;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.iqc-scope .iqc-edit-btn:hover {
  background: #0056b3;
}

.iqc-scope .iqc-save-btn {
  background: #28a745;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  margin-right: 5px;
}

.iqc-scope .iqc-cancel-btn {
  background: #6c757d;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.iqc-scope .iqc-input {
  flex: 2;
  padding: 6px 8px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 14px;
}

.iqc-scope .iqc-select {
  flex: 2;
  padding: 6px 8px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 14px;
  background: white;
}

.iqc-scope .iqc-error {
  background: #f8d7da;
  color: #721c24;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  margin-top: 8px;
}

.iqc-scope .iqc-loading {
  text-align: center;
  padding: 40px;
  color: #6c757d;
}

.iqc-scope .iqc-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 12px 16px;
  border-radius: 4px;
  color: white;
  font-weight: 500;
  z-index: 1000;
  opacity: 0;
  transition: opacity 0.3s;
}

.iqc-scope .iqc-toast.success {
  background: #28a745;
}

.iqc-scope .iqc-toast.error {
  background: #dc3545;
}

.iqc-scope .iqc-toast.show {
  opacity: 1;
}

.iqc-scope .iqc-readonly {
  color: #6c757d;
  font-style: italic;
}

.iqc-scope .iqc-billing-section {
  margin-top: 30px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 6px;
  text-align: center;
  
}

.iqc-scope .iqc-billing-button {
  background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 4px rgba(0,123,255,0.2);
}

.iqc-scope .iqc-billing-button:hover {
  background: linear-gradient(135deg, #0056b3 0%, #004085 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0,123,255,0.3);
}

.iqc-scope .iqc-billing-button:disabled {
  background: #6c757d;
  cursor: not-allowed;
  transform: none;
}

.iqc-scope .iqc-billing-loading {
  color: #007bff;
  font-style: italic;
  margin-top: 10px;
}

.iqc-scope .iqc-billing-error {
  color: #dc3545;
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  padding: 8px 12px;
  border-radius: 4px;
  margin-top: 10px;
  font-size: 14px;
}




