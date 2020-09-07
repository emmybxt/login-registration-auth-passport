const express = require("express");
const router = express.Router();
const app = express();
const mongoose = require("mongoose");
const session = require("express-session");
const flash = require("connect-flash");
const passport = require("passport");
require("./config/passport")(passport);
const expressEjsLayout = require("express-ejs-layouts");
const dbconfig = require("./config/db.config");

//Mongo db connection

mongoose
  .connect(dbconfig.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Mongodb connected Successfully");
  })
  .catch(() => {
    console.error(error);
  });

//EJS
app.set("view engine", "ejs");
app.use(expressEjsLayout);

//BodyParser
app.use(express.urlencoded({ extended: false }));
//express session
app.use(
  session({
    secret: "secret",
    resave: true,
    saveUninitialized: true,
  })
);
//use flash
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use((req, res, next) => {
  res.locals.success_msg = req.flash("success_msg");
  res.locals.error_msg = req.flash("error_msg");
  res.locals.error = req.flash("error");
  next();
});

//ROUTES
app.use("/", require("./routes/index"));
app.use("/users", require("./routes/users"));

app.listen(dbconfig.PORT, () => {
  console.log(`App is running on port ${dbconfig.PORT}`);
});
