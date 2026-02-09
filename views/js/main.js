(() => {
  /////////////////////////////////
  //#region CONVERSION FUNCS
  /////////////////////////////////

  /*
  Convert a Base64 string to an ArrayBuffer
  */
  function convertB64toArrayBuffer(base64String) {
    let binaryString = atob(base64String);
    let bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    let encryptedBuffer = bytes.buffer;
    return encryptedBuffer;
  }

  /*
  Convert an ArrayBuffer to a Base64 string
  */
  function convertArrayBuffertoB64(encryptedBuffer) {
    let bytes = new Uint8Array(encryptedBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    let base64String =  window.btoa(binary);
    return base64String;
  }

  /*
  Convert a Base64 string to an URL-Safe equivalent
  */
  function base64URLencode(base64String) {
    return base64String.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /*
  Convert an URL-Safe Base64 string to its original form
  */
  function base64URLdecode(urlSafeString) {
    let base64Encoded = urlSafeString.replace(/-/g, '+').replace(/_/g, '/');
    let padding = urlSafeString.length % 4 === 0 ? '' : '='.repeat(4 - (urlSafeString.length % 4));
    let base64String = base64Encoded + padding;
  
    return base64String;
  }

  //#endregion

  //-----------------------

  /////////////////////////////////
  //#region AES-GCM FUNCS
  /////////////////////////////////

  /*
  Generate an AES-GCM key (256-bit)
  */
  async function generateAesGcmKey(){
    let aesGcmKey = await window.crypto.subtle.generateKey(
      {
          name: "AES-GCM",
          length: 256,
      },
      true, // Must be 'true' to allow export
      ["encrypt", "decrypt"]
    );
    return aesGcmKey;
  };

  /*
  Export an AES-GCM key and convert the ArrayBuffer to a Base64 string
  */
  async function exportAesGcmKeyToBase64(key) {
    let exportedKeyBuffer = await window.crypto.subtle.exportKey(
      "raw", // Use "raw" format for symmetric keys
      key
    );
    let base64String = convertArrayBuffertoB64(exportedKeyBuffer);
    return base64String;
  }

  /*
  Import a Base64 string as an AES-GCM key
  */
  async function importBase64ToAesGcmKey(base64Key) {
    let importedKey = await window.crypto.subtle.importKey(
      "raw",
      Uint8Array.from(window.atob(base64Key), c => c.charCodeAt(0)),
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"]
    );
    return importedKey;
  }

  /*
  Generate a randomized ArrayBuffer, specifying length
  */
  function generateRandomArrayBuffer(length) {
    let randomArrayBuffer = crypto.getRandomValues(new Uint8Array(length));
    return randomArrayBuffer;
  }

  //#endregion

  //-----------------------

  /////////////////////////////////
  //#region FETCH FUNCS
  /////////////////////////////////

  /*
  Fetch the contents of an HTML element
  */
  function getMessage(element) {
    let messageBox = document.querySelector(element);
    let message = messageBox.value;
    return message;
  }

  /*
  Fetch the contents of an HTML element and encode
  */
  function getMessageEncoding(element) {
    let messageBox = document.querySelector(element);
    let message = messageBox.value;
    let enc = new TextEncoder();
    return enc.encode(message);
  }

  /*
  Fetch the concatenated contents of the "Ciphertext" textbox and separate out the
  specified value, then encode to a workable ArrayBuffer
  */
  function getConcatMessageEncoding(iv = false) {
    let message = document.head.querySelector("[property~=cipher][content]").content;
    let b64String = '';
    let encryptedBuffer = '';
    if (iv) {
      // Grab the IV portion of the string
      b64String = message.substring(0,16);
    } else {
      // Grab the CipherText portion of the string
      b64String = message.substring(16, message.length);
    }
    encryptedBuffer = convertB64toArrayBuffer(b64String);
    return encryptedBuffer;
  }

  /*
  Copy textarea contents to clipboard
  */
  async function copyToClipboard(textArea) {
    const copiedText = document.querySelector(".copied-text");
    if (textArea.value != '') {
      try {
        // Write value to Clipboard
        await navigator.clipboard.writeText(textArea.value);     
      } catch (err) {
        console.error('Failed to copy text: ', err);
      };
      // Update HTML
      copiedText.classList.add('fade-in');
      copiedText.addEventListener('animationend', () => {
        copiedText.classList.add('opaque');
        copiedText.classList.remove('fade-in');
      }, { once: true });
    };
  };

  //#endregion

  //-----------------------

  /////////////////////////////////
  //#region ENCRYPTION FORM
  /////////////////////////////////

  /*
  ENCRYPT THE MESSAGE
  */
  async function encryptMessage() {
    // Fetch message
    let encoded = getMessageEncoding("#aes-gcm-message");
    // Generate an IV and convert to Base64
    let iv = generateRandomArrayBuffer(12); // 96-bit standard
    let base64iv = iv.toBase64();
    // Generate an AES-GCM key and convert to Base64 (URL-Safe)
    let key = await generateAesGcmKey();
    let base64Key = await exportAesGcmKeyToBase64(key);
    let base64UrlSafe = base64URLencode(base64Key);
    // Encrypt the message
    let ciphertext = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv
      },
      key,
      encoded
    );
    // Convert Ciphertext to Base64
    let base64Cipher = convertArrayBuffertoB64(ciphertext);
    // Concatenate Base64 Ciphertext and IV to a single string
    let concatCipherIV = base64iv.concat(base64Cipher);
    // Construct POST method with the Concatenated Ciphertext
    let details = {
      'cipher': `${concatCipherIV}`,
    };
    let formBody = [];
    for (var property in details) {
      var encodedKey = encodeURIComponent(property);
      var encodedValue = encodeURIComponent(details[property]);
      formBody.push(encodedKey + "=" + encodedValue);
    }
    formBody = formBody.join("&");
    // POST and receive response
    let noteUrl = await fetch('/encrypt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: formBody
    });
    if (!noteUrl.ok) {
      throw new Error(`Response status: ${noteUrl.status}`);
    }
    // Parse the response body as JSON
    let data = await noteUrl.json(); 
    data = data.id;
    // Concatenate UUID response with Secret key to form complete URL
    let concatUrl = data.concat(base64UrlSafe);
    // Output to HTML fields
    const messageLink = document.querySelector(".aes-gcm #noteURL-value");
    messageLink.classList.add('fade-in');
    messageLink.addEventListener('animationend', () => {
    messageLink.classList.remove('fade-in');
    }, { once: true });
    messageLink.textContent = concatUrl;
  };

  /*
  DECRYPT THE MESSAGE
  */
  async function decryptMessage() {
    // Fetch values
    let encodedCipher = getConcatMessageEncoding();
    let encodedIV = getConcatMessageEncoding(true);
    // Fetch secret key
    let windowHash = window.location.hash;
    let encodedKey = windowHash.substring(1, 44);
    // Convert Secret key back to Base64
    let base64Key = base64URLdecode(encodedKey);
    // Convert the Base64 key value to a valid AES-GCM key
    let convertedKey = await importBase64ToAesGcmKey(base64Key);
    // Decrypt the message
    let decrypted = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: encodedIV // Apparently this gets labeled, and in subtle.encrypt it doesn't???
      },
      convertedKey,
      encodedCipher
    );
    // Output to HTML fields
    let dec = new TextDecoder();
    const decryptedValue = document.querySelector(".aes-gcm #decrypted-value");
    decryptedValue.classList.add('fade-in');
    decryptedValue.addEventListener('animationend', () => {
      decryptedValue.classList.remove('fade-in');
    }, { once: true });
    decryptedValue.textContent = dec.decode(decrypted);
  }

  //#endregion

  //-----------------------

  /////////////////////////////////
  //#region LISTENERS
  /////////////////////////////////

  /*
  Encrypt message page
  */
  if (document.querySelector("#aes-gcm-message")) {
    // Encrypt Button
    const encryptButton = document.querySelector(".aes-gcm .encrypt-button");
    encryptButton.addEventListener("click", () => {
      // Check if the message is blank
      if (document.querySelector("#aes-gcm-message").value != '') {
        // Lock the textarea and button
        const messageArea = document.querySelector("#aes-gcm-message");
        messageArea.readOnly = true;
        encryptButton.disabled = true;
        // Encrypt the message
        encryptMessage();
      };
    });
    // Copy to Clipboard
    const textArea = document.querySelector("#noteURL-value");
    textArea.addEventListener('click', async () => {
      copyToClipboard(textArea);
    });
  };

  /*
  Decrypt message page
  */
  if (document.head.querySelector("[property~=status][content]").content != 'false') {
    // Decrypt the message
    decryptMessage();
    // Copy to Clipboard
    const textArea = document.querySelector("#decrypted-value");
    textArea.addEventListener('click', async () => {
      copyToClipboard(textArea);
    });
  } else {
    // Update the HTML
    const textArea = document.querySelector("#decrypted-value");
    textArea.value = "error: invalid request."
    textArea.style.backgroundColor = "#A44";
  };

  //#endregion

  //-----------------------

})();
