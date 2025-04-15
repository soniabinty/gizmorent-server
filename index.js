const express = require("express");
const cors = require("cors");
require("dotenv").config();
const axios = require("axios");
const bcrypt = require("bcrypt");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require('stripe')(process.env.STRIPE_ACCESS_KEY)
const SSLCommerzPayment = require("sslcommerz-lts");
const app = express();
const port = process.env.PORT || 5000;
const store_id = process.env.store_id;
const store_passwd = process.env.store_passwd;
const is_live = false;
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.du8ko.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect(); // Keep the connection open
    console.log("Connected to MongoDB!");

    const gadgetCollection = client.db("gizmorentdb").collection("gadget");

    const wishlistedCollection = client.db("gizmorentdb").collection("wishlisted");


    const paymentCollection = client.db("gizmorentdb").collection("payments");

    const reviewCollection = client.db("gizmorentdb").collection("review");
    const rentalRequestCollection = client
      .db("gizmorentdb")
      .collection("renter_request");
    const userCollection = client.db("gizmorentdb").collection("users");
    const cartlistCollection = client.db("gizmorentdb").collection("cart");
    // const paymentsCollection = client.db('gizmorentdb').collection('payments')


    // Add a gadget
    app.post("/gadgets", async (req, res) => {
      const newGadget = req.body;
      newGadget.serialCode = `GR-${Date.now()
        .toString()
        .slice(-5)}-${Math.floor(Math.random() * 1000)}`;

      const result = await gadgetCollection.insertOne(newGadget);
      res.send(result);
    });

    // Get all gadgets
    app.get("/gadgets", async (req, res) => {
      const result = await gadgetCollection.find().toArray();
      res.send(result);
    });

    // gadgets filter and search

    app.get("/gadgets/search", async (req, res) => {
      const {
        query,
        category,
        minPrice,
        maxPrice,
        sort,
        page = 1,
        limit = 6,
      } = req.query;

      const filter = {};

      // Filter by category
      if (category && category !== "All") {
        filter.category = category;
      }

      // Filter by search query
      if (query) {
        filter.$or = [
          { name: { $regex: query, $options: "i" } },
          { category: { $regex: query, $options: "i" } },
        ];
      }

      // Price filter
      if (minPrice || maxPrice) {
        filter.price = {};
        if (minPrice) filter.price.$gte = parseFloat(minPrice);
        if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
      }

      // Sort
      let sortOption = {};
      if (sort === "HighToLow") {
        sortOption = { price: -1 };
      } else if (sort === "LowToHigh") {
        sortOption = { price: 1 };
      }

      try {
        // Calculate pagination values
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const gadgets = await gadgetCollection
          .find(filter)
          .sort(sortOption)
          .skip(skip)
          .limit(parseInt(limit))
          .toArray();

        // Get total count for pagination
        const totalItems = await gadgetCollection.countDocuments(filter);
        const totalPages = Math.ceil(totalItems / parseInt(limit));

        res.json({
          gadgets,
          currentPage: parseInt(page),
          totalPages: totalPages,
        });
      } catch (error) {
        res.status(500).json({ message: "Error fetching gadgets", error });
      }
    });

    // one gadget by id
    app.get("/gadgets/:id", async (req, res) => {
      const id = req.params.id;

      // Validate the gadget ID
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid gadget ID" });
      }

      const query = { _id: new ObjectId(id) };

      try {
        // Query the database for the gadget
        const result = await gadgetCollection.findOne(query);

        if (result) {
          // Gadget found, send it in the response
          res.send(result);
        } else {
          // Gadget not found, return a 404 error
          res.status(404).send({ error: "Gadget not found" });
        }
      } catch (error) {
        // Log the error for debugging purposes
        console.error("Error fetching gadget:", error);

        // Return a 500 Internal Server Error
        res.status(500).send({ error: "Failed to fetch gadget" });
      }
    });

    // Update a gadget by ID
    app.put("/gadgets/:id", async (req, res) => {
      const id = req.params.id;

      // Validate the gadget ID
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid gadget ID" });
      }

      const updatedGadget = req.body;
      const query = { _id: new ObjectId(id) };

      try {
        const result = await gadgetCollection.updateOne(query, { $set: updatedGadget });

        if (result.matchedCount === 0) {
          // If no gadget was found with the given ID
          res.status(404).send({ error: "Gadget not found" });
        } else {
          // Gadget successfully updated
          res.send({ message: "Gadget updated successfully", result });
        }
      } catch (error) {
        // Log the error for debugging purposes
        console.error("Error updating gadget:", error);

        // Return a 500 Internal Server Error
        res.status(500).send({ error: "Failed to update gadget" });
      }
    });

    // one gadget by product code
    app.get("/gadget/:serialCode", async (req, res) => {
      const { serialCode } = req.params;
      try {
        const result = await gadgetCollection.findOne({ serialCode });
        res.send(result);
      } catch {
        res.status(500).send({ error: "Failed to fetch product" });
      }
    });

    app.get("/product-review/:productId", async (req, res) => {
      const { productId } = req.params;

      try {
        const reviews = await reviewCollection.find({ productId }).toArray();
        res.send(reviews);
      } catch {
        res.status(500).send({ error: "Failed to fetch reviews" });
      }
    });

    // review post
    app.post("/product-review", async (req, res) => {
      try {
        const newReview = req.body;
        const result = await reviewCollection.insertOne(newReview);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to add review" });
      }
    });

    // Add renter application
    app.post("/renter_request", async (req, res) => {
      const { email } = req.body;
      const existingRenter = await rentalRequestCollection.findOne({ email });

      if (existingRenter) {
        res
          .status(400)
          .send({ error: "You have already submitted a renter request." });
      } else {
        const newRenter = req.body;
        const result = await rentalRequestCollection.insertOne(newRenter);
        res.send(result);
      }
    });

    app.get("/renter_request", async (req, res) => {
      const result = await rentalRequestCollection.find().toArray();
      res.send({ requests: result });
    });

    // renter approval & renterid

    app.patch("/approve_renter/:email", async (req, res) => {

      console.log('Approving renter:', req.params.email); // Debug log to check the email being passed



      console.log("Approving renter:", req.params.email); // Debug log to check the email being passed
      const email = req.params.email;

      const renterCode =
        "RENTER-" + Math.random().toString(36).substr(2, 6).toUpperCase();


      try {
        const result = await userCollection.updateOne(
          { email },
          {
            $set: {
              role: "renter",
              renterCode,
            },
          }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({ error: "User not found" });
        }

        const rentarCollection = client.db("gizmorentdb").collection("rentar");
        await rentarCollection.insertOne({
          email,
          renterCode,
          createdAt: new Date(),


        });

        await rentalRequestCollection.deleteOne({ email });

        res.send({ modifiedCount: result.modifiedCount, renterCode });
      } catch (error) {
        console.error("Approval error:", error);
        res.status(500).send({ error: "Failed to approve renter" });
      }
    });




    //  renter rejection

    app.delete("/reject_renter/:email", async (req, res) => {
      const email = req.params.email;


      try {
        await rentalRequestCollection.deleteOne({ email });

        res.send({ message: "Renter request rejected" });
      } catch (error) {
        res.status(500).send({ error: "Failed to reject request" });
      }
    });

    // Register User
    app.post("/register", async (req, res) => {
      const { name, email, password, photoURL } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = {
        name,
        email,
        password: hashedPassword,
        photoURL,
        failedAttempts: 0,
        isLocked: false,
        role: "user",
      };
      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });

    // test User
    app.get("/user", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);

    });

    // Get user data by email
    app.get("/users", async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ error: "Email is required" });
      }

      try {
        const user = await userCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ error: "User not found" });
        }

        res.send(user);
      } catch (error) {
        console.error("Error fetching user data:", error);
        res.status(500).send({ error: "Failed to fetch user data" });
      }

    });

    // user post
    app.post("/users", async (req, res) => {
      const { name, email, password, photoURL } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = {
        name,
        email,
        password: hashedPassword,
        photoURL,
        role: "user",
      };
      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });


    app.post("/update-password", async (req, res) => {
      const { email, newPassword } = req.body;

      if (!email || !newPassword) {
        return res.status(400).send({ error: "Email and new password are required" });
      }

      try {
        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update the password in the database
        const result = await userCollection.updateOne(
          { email },
          { $set: { password: hashedPassword } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({ error: "User not found" });
        }

        res.send({ message: "Password updated successfully" });
      } catch (error) {
        console.error("Error updating password:", error);
        res.status(500).send({ error: "Failed to update password" });
      }
    });


    app.patch("/users/:email", async (req, res) => {
      const email = req.params.email;
      const updatedFields = req.body;

      try {
        // Step 1: Check if the user exists in the database
        const existingUser = await userCollection.findOne({ email });

        if (!existingUser) {
          return res.status(404).send({ error: "User not found" });
        }

        // Step 2: Update only the provided fields
        const updateQuery = {};
        for (const key in updatedFields) {
          if (updatedFields[key] !== undefined) {
            updateQuery[key] = updatedFields[key];
          }
        }

        // Step 3: Perform the update operation
        const result = await userCollection.updateOne(
          { email },
          { $set: updateQuery }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ error: "Failed to update user" });
        }

        // Step 4: Send success response
        res.send({ message: "User updated successfully", updatedFields });
      } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).send({ error: "Failed to update user" });
      }
    });

    // Google login or signup route
    app.post("/auth/google", async (req, res) => {
      const { name, email, photoURL } = req.body;

      if (!email) {
        return res.status(400).send({ error: "Email is required" });
      }

      try {
        // Step 1: Check if the user already exists
        const existingUser = await userCollection.findOne({ email });

        if (existingUser) {
          return res.send(existingUser);
        }

        const newUser = {
          name,
          email,
          photoURL,
          role: "user",
          createdAt: new Date(),
        };

        const result = await userCollection.insertOne(newUser);

        res.send(newUser);
      } catch (error) {
        res.status(500).send({ error: "Failed to process Google login" });
      }
    });



    // Adding wishlist
    app.post("/wishlisted", async (req, res) => {
      try {
        const { gadgetId, name, image, price, category, email } = req.body;

        if (!gadgetId || !name || !price || !email) {
          return res.status(400).send({ message: "Missing required fields" });
        }

        const exists = await wishlistedCollection.findOne({ email, gadgetId });

        if (exists) {
          return res
            .status(400)
            .send({ message: "Gadget already in wishlist" });
        }

        const wish = await wishlistedCollection.insertOne(req.body);
        res.status(201).send(wish);
      } catch (error) {
        console.error("Wishlist error:", error);
        res.status(500).send({ message: "Failed to add to wishlist" });
      }
    });

    // get wishlist by email

    app.get("/wishlisted", async (req, res) => {
      try {
        const { email } = req.query;
        const query = email ? { email } : {};
        const result = await wishlistedCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch wishlist" });
      }
    });

    // Delete from wishlist
    app.delete("/wishlisted/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await wishlistedCollection.deleteOne(query);

        if (result.deletedCount > 0) {
          res.json({ deletedCount: 1 });
        } else {
          res.status(404).json({ error: "Item not found" });
        }
      } catch (error) {
        res.status(500).json({ error: "Failed to delete item" });
      }
    });

    // add cart list
    app.post("/cartlist", async (req, res) => {
      try {

        const {
          gadgetId,
          name,
          image,
          price,
          category,
          email,
          quantity = 1,
        } = req.body;

        if (!gadgetId || !name || !price || !email) {
          return res.status(400).send({ message: "Missing required fields" });
        }

        const cartItem = await cartlistCollection.insertOne({
          ...req.body,
          quantity,
        });
        res.status(201).send(cartItem);
      } catch (error) {
        console.error("Cartlist error:", error);
        res.status(500).send({ message: "Failed to add to cart" });
      }
    });

    // get cart by email
    app.get("/cartlist", async (req, res) => {
      try {
        const { email } = req.query;

        if (!email) {
          return res.status(400).json({ error: "Email is required" });
        }


        const cartItems = await cartlistCollection.find({ email }).toArray();

        if (cartItems.length === 0) {
          return res
            .status(404)
            .json({ message: "No items found in the cart" });
        }


        return res.status(200).json(cartItems);
      } catch (error) {
        console.error("Error fetching cart items:", error);
        return res.status(500).json({ error: "Failed to fetch cart items" });
      }
    });

    // Remove from cart
    app.delete("/cartlist/:id", async (req, res) => {
      try {
        const id = req.params.id;


        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid ID format" });
        }

        const query = { _id: new ObjectId(id) };
        const result = await cartlistCollection.deleteOne(query);

        if (result.deletedCount > 0) {
          return res.json({ deletedCount: 1, id });
        } else {
          return res.status(404).json({ error: "Item not found in cart" });
        }
      } catch (error) {
        console.error(error);
        return res
          .status(500)
          .json({ error: "Failed to delete item from cart" });
      }
    });

    // update quantity

    app.patch("/cartlist/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { quantity } = req.body;


        if (quantity <= 0 || isNaN(quantity)) {
          return res
            .status(400)
            .json({ error: "Quantity must be a positive number" });
        }


        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ error: "Invalid ID format" });
        }

        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { quantity: quantity },
        };

        const result = await cartlistCollection.updateOne(query, updateDoc);

        if (result.modifiedCount > 0) {

          const updatedItem = await cartlistCollection.findOne(query);
          return res.json(updatedItem);
        } else {
          return res.status(404).json({ error: "Item not found in cart" });
        }
      } catch (error) {
        console.error("Error updating cart item quantity:", error);
        return res
          .status(500)
          .json({ error: "Failed to update item quantity" });
      }
    });

    // payment intrigation

    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: price * 100, // Stripe expects the amount in cents
          currency: 'usd',
          payment_method_types: ['card'],
        });

        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        console.error("Payment Intent Error:", error);

        // Send more specific error messages based on the error type
        if (error.type === 'StripeCardError') {
          res.status(400).send({ error: "Card error: " + error.message });
        } else {
          res.status(500).send({ error: "Internal Server Error" });
        }
      }
    });

    app.post("/payments", async (req, res) => {
      const paymentInfo = req.body


      const result = await paymentsCollection.insertOne(paymentInfo);

      res.send(result);


    });

    app.post("/orders", async (req, res) => {
      const orderData = req.body
      const result = await ordersCollection.insertOne(orderData);

      res.send(result);


    });

    app.get("/orders", async (req, res) => {
      const result = await paymentsCollection.find().toArray();
      res.send(result);
    })

    // SSLCommerz initiation
    app.post("/sslcommerz-payment", async (req, res) => {
      const { total_amount, cus_name, cus_email, cus_phone } = req.body;

      // Add the required shipping_method field
      const paymentData = {
        total_amount,
        currency: "USD",
        tran_id: `TRX_${Date.now()}`, // Unique transaction ID
        success_url: "http://localhost:5173/payment-success", // Add Like site Url 
        fail_url: "http://localhost:5173/payment-fail",
        cancel_url: "http://localhost:5173/payment-cancel",
        cus_name,
        cus_email,
        cus_phone,
        shipping_method: "Courier",
        product_name: "Gadget Rent",
        product_category: "Rental",
        product_profile: "general",
        ship_name: cus_name,
        ship_add1: "Dhaka",
        ship_add2: "Dhaka",
        ship_city: "Dhaka",
        ship_state: "Dhaka",
        ship_postcode: "1000",
        ship_country: "Bangladesh",
      };

      try {
        const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
        const apiResponse = await sslcz.init(paymentData);

        console.log("SSLCommerz API Response", apiResponse);

        if (apiResponse && apiResponse.GatewayPageURL) {
          await paymentsCollection.insertOne({
            email: cus_email,
            amount: total_amount,
            transactionId: paymentData.tran_id,
            date: new Date(),
          });

          res.send({ url: apiResponse.GatewayPageURL });
        } else {
          console.log("Failed to get payment gateway URL");
          res.status(500).send({ error: "Failed to get payment gateway URL" });
        }
      } catch (error) {
        console.log("SSLCommerz Error", { error: error.message });
        res.status(500).send({ error: "Payment initiation failed" });
      }
    });

    app.post("/payment-success", async (req, res) => {
      const { tran_id, val_id } = req.body; // Include val_id from the payment gateway response

      try {
        // Step 1: Validate the transaction with SSLCommerz
        const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
        const validationResponse = await sslcz.validate({ val_id });

        if (validationResponse.status !== "VALID") {
          return res.status(400).send({ error: "Transaction validation failed" });
        }

        // Step 2: Update transaction in the database
        const result = await transactionsCollection.updateOne(
          { transactionId: tran_id },
          {
            $set: {
              status: "Successful",
              validationDetails: validationResponse,
            },
          }
        );

        if (result.modifiedCount > 0) {
          res.send({ message: "Payment validated and success recorded." });
        } else {
          res.status(404).send({ error: "Transaction not found" });
        }
      } catch (error) {
        console.error("Error validating transaction:", error);
        res.status(500).send({ error: "Failed to validate transaction" });
      }
    });

    // Stripe payment route
    app.post("/create-payment-intent", async (req, res) => {
      const { price, cus_name, cus_email } = req.body;

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: price * 100, // Stripe expects the amount in cents
          currency: "usd",
          payment_method_types: ["card"],
        });

        // Save transaction in the unified collection
        await transactionsCollection.insertOne({
          transactionId: paymentIntent.id,
          amount: price,
          paymentMethod: "Stripe",
          status: "Pending",
          date: new Date(),
          customerDetails: { cus_name, cus_email },
        });

        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        console.error("Payment Intent Error:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // Stripe Webhook or Success Callback
    app.post("/stripe-payment-success", async (req, res) => {
      const { transactionId } = req.body;

      try {
        const result = await transactionsCollection.updateOne(
          { transactionId },
          { $set: { status: "Successful" } }
        );

        if (result.modifiedCount > 0) {
          res.send({ message: "Stripe payment successful." });
        } else {
          res.status(404).send({ error: "Transaction not found" });
        }
      } catch (error) {
        console.error("Error updating payment status:", error);
        res.status(500).send({ error: "Failed to update payment status" });
      }
    });

  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

run();

app.get("/", (req, res) => {
  res.send("Gizmorent is running");
});

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});