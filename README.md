TryBuyNumber
===

Simple [Twilio](https://www.twilio.com)-backed US phone number acquisition module.

Installation
---

```$ npm install trybuynumber```

Usage
---

```
var tbn = require('trybuynumber');
tbn.purchasePhoneNumberAsync({nearPhoneNumber: '+16196210102'})
  .then(function(purchasedNumber) {
    console.log('Yeay - I am proud owner of ' + purchasedNumber);
  })
  .catch(function(error) {
    console.error(error);
  });

```

