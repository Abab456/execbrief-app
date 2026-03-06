// Server file

const express = require('express');
const app = express();
const database = require('./database'); // Updated the path to database

// Other server configurations

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});