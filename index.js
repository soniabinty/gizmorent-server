const express = require("express");
const cors = require("cors");
require("dotenv").config();
const axios = require("axios");
const bcrypt = require("bcrypt");
const SSLCommerzPayment = require("sslcommerz-lts");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require('stripe')(process.env.STRIPE_ACCESS_KEY )
const app = express();
const port = process.env.PORT || 3000;
const store_id = process.env.store_id;
const store_passwd = process.env.store_passwd;
const is_live = false; // Set to true for production

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
    const rentalRequestCollection = client.db("gizmorentdb").collection("renter_request");
    const userCollection = client.db("gizmorentdb").collection("users");

    const transactionsCollection = client.db("gizmorentdb").collection("transactions");

    const cartlistCollection = client.db("gizmorentdb").collection("cart");
   


    // Add a gadget
    app.post("/gadgets", async (req, res) => {
      const newGadget = req.body;
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
      const { query, category, minPrice, maxPrice, sort, page = 1, limit = 6 } = req.query;

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
    app.get('/gadgets/:id', async (req, res) => {
      const id = req.params.id;


      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: 'Invalid gadget ID' });
      }

      const query = { _id: new ObjectId(id) };
      try {
        const result = await gadgetCollection.findOne(query);
        if (result) {
          res.send(result);
        } else {
          res.status(404).send({ error: 'Gadget not found' });
        }
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch gadget' });
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
        res.status(400).send({ error: "You have already submitted a renter request." });
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
      const newUser = { name, email, password: hashedPassword, photoURL, failedAttempts: 0, isLocked: false, role: 'user' };
      const existing = await userCollection.findOne({ email });
      if (existing) return res.status(400).send({ error: "User already exists" });
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

    app.post("/users", async (req, res) => {
      const { name, email, password, photoURL } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = { name, email, password: hashedPassword, photoURL, role: 'user' };
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

    // Adding gadgets to wishlist
    app.post('/wishlisted', async (req, res) => {
      const newWish = req.body
      const wish = await wishlistedCollection.insertOne(newWish)
      res.send(wish)
      console.log(wish)

    })

    app.get("/wishlisted", async (req, res) => {
      try {
        const result = await wishlistedCollection.find().toArray();
        res.send(result);
        console.log(result)
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch gadgets" });
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





    app.get("/initiate-payment", async (req, res) => {
      const result = await transactionsCollection.find().toArray();
      res.send(result);
    })


    // Payment initiation
    app.post("/initiate-payment", async (req, res) => {
      const { total_amount, cus_name, cus_email, cus_phone } = req.body;

      const paymentData = {
        total_amount,
        currency: "BDT",
        tran_id: `TRX_${Date.now()}`, // Unique transaction ID
        success_url: "http://localhost:5173/payment-success",
        fail_url: "http://localhost:5173/payment-fail",
        cancel_url: "http://localhost:5173/payment-cancel",
        ipn_url: "http://localhost:5173/ipn", // Optional
        shipping_method: "Courier",
        product_name: "Gadget Rent",
        product_category: "Rental",
        product_profile: "general",
        cus_name,
        cus_email,
        cus_add1: "Dhaka",
        cus_add2: "Dhaka",
        cus_city: "Dhaka",
        cus_state: "Dhaka",
        cus_postcode: "1000",
        cus_country: "Bangladesh",
        cus_phone,
        cus_fax: cus_phone, // Optional
        ship_name: cus_name, // Same as customer name for simplicity
        ship_add1: "Dhaka",
        ship_add2: "Dhaka",
        ship_city: "Dhaka",
        ship_state: "Dhaka",
        ship_postcode: "1000",
        ship_country: "Bangladesh",
      };

      try {
        console.log("Initiating payment with data:", paymentData);

        const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
        const apiResponse = await sslcz.init(paymentData);


        if (apiResponse && apiResponse.GatewayPageURL) {
          // Optional: Save the transaction in the database
          await transactionsCollection.insertOne({
            transactionId: paymentData.tran_id,
            amount: total_amount,
            status: "Pending",
            date: new Date(),
            customer: { cus_name, cus_email, cus_phone },
          });

          // Redirect the user to the payment gateway
          res.send({ url: apiResponse.GatewayPageURL });
        } else {
          res.status(500).send({ error: "Failed to get payment gateway URL" });
        }
      } catch (error) {
        console.error("SSLCommerz Error:", error.message);
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

    app.post("/update-payment-status", async (req, res) => {
      const { transactionId, status } = req.body;

      if (!transactionId || !status) {
        return res.status(400).send({ success: false, error: "Transaction ID and status are required." });
      }

      try {
        const result = await transactionsCollection.updateOne(
          { transactionId },
          { $set: { status } }
        );

        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Payment status updated successfully." });
        } else {
          res.status(404).send({ success: false, error: "Transaction not found." });
        }
      } catch (error) {
        console.error("Error updating payment status:", error);
        res.status(500).send({ success: false, error: "Failed to update payment status." });
      }
    });




    app.post("/create-payment-intent", async (req, res) => {
  const { price } = req.body;
  const totalAmount = parseInt(price * 100); 
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: "usd",
      payment_method_types: ["card"],
    });
  
    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    res.status(500).send({ error: "Error creating payment intent" });
  }
});

app.post("/payments", async (req, res) => {
  const paymentInfo = req.body;
  
  const result = await paymentCollection.insertOne(paymentInfo);
  res.send(result);

})


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