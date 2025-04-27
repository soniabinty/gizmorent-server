const express = require("express");
const cors = require("cors");
require("dotenv").config();

const bcrypt = require("bcrypt");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const stripe = require("stripe")(process.env.STRIPE_ACCESS_KEY);

const app = express();
const port = process.env.PORT || 5000;
const initiateSSLCommerzPayment = require("./services/sslcommerzPayment");

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
    const wishlistedCollection = client
      .db("gizmorentdb")
      .collection("wishlisted");
    const reviewCollection = client.db("gizmorentdb").collection("review");
    const rentalRequestCollection = client
      .db("gizmorentdb")
      .collection("renter_request");
    const userCollection = client.db("gizmorentdb").collection("users");
    const cartlistCollection = client.db("gizmorentdb").collection("cart");
    const paymentsCollection = client.db("gizmorentdb").collection("payments");
    const ordersCollection = client.db("gizmorentdb").collection("orders");
    const websitereviewCollection = client
      .db("gizmorentdb")
      .collection("websitereview");
    const renterGadgetCollection = client
      .db("gizmorentdb")
      .collection("renter-gadgets");
    const notificationCollection = client.db("gizmorentdb").collection("notifications");

    // admin
    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;

      // if (email !== req.decoded.email) {
      //   return res.status(403).send({ message: "forbidden access" });
      // }
      const query = { email: email };

      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });
    // renter

    app.get("/users/renter/:email", async (req, res) => {
      const email = req.params.email;

      // if (email !== req.decoded.email) {
      //   return res.status(403).send({ message: "forbidden access" });
      // }
      const query = { email: email };

      const user = await userCollection.findOne(query);
      let renter = false;
      if (user) {
        renter = user?.role === "renter";
      }
      res.send({ renter });
    });

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
        limit = 8,
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

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid gadget ID" });
      }

      const query = { _id: new ObjectId(id) };
      try {
        const result = await gadgetCollection.findOne(query);
        if (result) {
          res.send(result);
        } else {
          res.status(404).send({ error: "Gadget not found" });
        }
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch gadget" });
      }
    });

    app.put("/gadgets/:id", async (req, res) => {
      const id = req.params.id;

      // Validate the gadget ID
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid gadget ID" });
      }

      const updatedGadget = req.body;
      const userEmail = updatedGadget.email;
      const query = { _id: new ObjectId(id) };

      try {
        const result = await gadgetCollection.updateOne(query, {
          $set: updatedGadget,
        });

        if (result.matchedCount === 0) {
          // If no gadget was found with the given ID
          res.status(404).send({ error: "Gadget not found" });
        } else {
          // Gadget successfully updated
          await notificationCollection.insertOne({
            email, // Notify the user who updated the gadget
            message: `Your gadget "${updatedGadget.name}" has been updated successfully.`,
            type: "gadget_update",
            isRead: false,
            createdAt: new Date(),
          });

          res.send({ message: "Gadget updated successfully", result });
        }
      } catch (error) {
        // Log the error for debugging purposes
        console.error("Error updating gadget:", error);

        // Return a 500 Internal Server Error
        res.status(500).send({ error: "Failed to update gadget" });
      }
    });

    app.delete("/gadgets/:id", async (req, res) => {
      const id = req.params.id;

      // Validate the gadget ID
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid gadget ID" });
      }
      const { email } = req.query;
      const query = { _id: new ObjectId(id) };

      try {
        const gadget = await gadgetCollection.findOne(query);

        const result = await gadgetCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          // If no gadget was found with the given ID
          res.status(404).send({ error: "Gadget not found" });
        } else {
          // Add notification for gadget deletion
          await notificationCollection.insertOne({
            userEmail, // Notify the user who deleted the gadget
            message: `Your gadget "${gadget?.name || "Unknown"}" has been deleted successfully.`,
            type: "gadget_deletion",
            isRead: false,
            createdAt: new Date(),
          });

          // Gadget successfully deleted
          res.send({ message: "Gadget deleted successfully", result });
        }
      } catch (error) {
        // Log the error for debugging purposes
        console.error("Error deleting gadget:", error);

        // Return a 500 Internal Server Error
        res.status(500).send({ error: "Failed to delete gadget" });
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

    // top rented gadgets
    app.get("/top-rented-gadgets", async (req, res) => {
      try {
        const topRentedGadgets = await ordersCollection
          .aggregate([
            {
              $match: {
                product_id: { $exists: true, $ne: null },
              },
            },
            {
              $group: {
                _id: "$product_id",
                totalRented: { $sum: 1 },
              },
            },
            {
              $sort: { totalRented: -1 },
            },
            // {
            //   $limit: 20,
            // },
            {
              $addFields: {
                objectId: { $toObjectId: "$_id" }, // create correct ObjectId
              },
            },
            {
              $lookup: {
                from: "gadget",
                localField: "objectId",
                foreignField: "_id",
                as: "gadgetDetails",
              },
            },
            {
              $unwind: "$gadgetDetails",
            },
            {
              $limit: 10,
            },
          ])
          .toArray();

        res.send(topRentedGadgets);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Something went wrong" });
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

    // renter review find

    app.get("/renter-review/:ownerEmail", async (req, res) => {
      const { ownerEmail } = req.params;

      const result = await reviewCollection.find({ ownerEmail }).toArray();

      res.send(result);
    });

    // renter gadget

    app.post("/renter-gadgets", async (req, res) => {
      const renterGadget = req.body;
      const result = await renterGadgetCollection.insertOne(renterGadget);
      res.send(result);
    });


    // get renter gadgets
    app.get("/renter-gadgets", async (req, res) => {
      const { status } = req.query;
      const query = status ? { status } : {};
      const result = await renterGadgetCollection.find(query).toArray();
      res.send(result);
    });

    app.put("/renter-gadgets/:id", async (req, res) => {
      const id = req.params.id;
      const updatedGadget = req.body;
      delete updatedGadget._id;
      const result = await renterGadgetCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedGadget }
      );

      await notificationCollection.insertOne({
        userEmail: updatedGadget.email,
        message: `Your gadget "${updatedGadget.name}" has been approved.`,
        type: "gadget_approval",
        isRead: false,
        createdAt: new Date(),
      });
      res.send(result);
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
      const { email, name } = req.body; // Assuming `name` is also passed in the request body
      const existingRenter = await rentalRequestCollection.findOne({ email });

      if (existingRenter) {
        res.status(400).send({ error: "You have already submitted a renter request." });
      } else {
        const newRenter = req.body;

        try {
          const result = await rentalRequestCollection.insertOne(newRenter);

          // Add notification for admin
          await notificationCollection.insertOne({
            userEmail: "admin@gizmorent.com", // Replace with the actual admin email
            message: `${name} (${email}) has submitted a renter request.`,
            type: "renter_request",
            isRead: false,
            createdAt: new Date(),
            role: "admin",
          });

          res.send(result);
        } catch (error) {
          console.error("Error submitting renter request:", error);
          res.status(500).send({ error: "Failed to submit renter request" });
        }
      }
    });

    app.get("/renter_request", async (req, res) => {
      try {
        const result = await rentalRequestCollection.find().toArray();
        res.send({ requests: result });
      } catch (error) {
        console.error("Error fetching renter requests:", error);
        res.status(500).send({ error: "Failed to fetch renter requests" });
      }
    });

    // Renter approval & renterid
    app.patch("/approve_renter/:email", async (req, res) => {
      console.log("Approving renter:", req.params.email); // Debug log to check the email being passed
      const email = req.params.email;

      const renterCode = "RENTER-" + Math.random().toString(36).substr(2, 6).toUpperCase();

      try {
        const user = await userCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ error: "User not found" });
        }

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

        // Add notification for renter
        await notificationCollection.insertOne({
          userEmail: email,
          message: `Your renter request has been approved. Your renter code is ${renterCode}.`,
          type: "renter_approval",
          isRead: false,
          createdAt: new Date(),
        });

        // Add notification for admin
        await notificationCollection.insertOne({
          userEmail: "admin@gizmorent.com", // Replace with the actual admin email
          message: `Renter request for ${user.name} (${email}) has been approved. Renter code: ${renterCode}.`,
          type: "renter_approval",
          isRead: false,
          createdAt: new Date(),
          role: "admin",
        });

        res.send({ modifiedCount: result.modifiedCount, renterCode });
      } catch (error) {
        console.error("Approval error:", error);
        res.status(500).send({ error: "Failed to approve renter" });
      }
    });

    // Renter rejection
    app.delete("/reject_renter/:email", async (req, res) => {
      const email = req.params.email;

      try {
        const user = await rentalRequestCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ error: "Renter request not found" });
        }

        await rentalRequestCollection.deleteOne({ email });

        // Add notification for renter
        await notificationCollection.insertOne({
          userEmail: email,
          message: `Your renter request has been rejected.`,
          type: "renter_rejection",
          isRead: false,
          createdAt: new Date(),
        });

        // Add notification for admin
        await notificationCollection.insertOne({
          userEmail: "admin@gizmorent.com", // Replace with the actual admin email
          message: `Renter request for ${user.name} (${email}) has been rejected.`,
          type: "renter_rejection",
          isRead: false,
          createdAt: new Date(),
          role: "admin",
        });

        res.send({ message: "Renter request rejected" });
      } catch (error) {
        console.error("Error rejecting renter request:", error);
        res.status(500).send({ error: "Failed to reject request" });
      }
    });

    // getting all renter
    app.get("/renter", async (req, res) => {
      try {
        const renters = await userCollection.find({ role: "renter" }).toArray();
        res.send(renters);
      } catch (error) {
        console.error("Error fetching renters:", error);
        res.status(500).send({ error: "Failed to fetch renters" });
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
        return res
          .status(400)
          .send({ error: "Email and new password are required" });
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

    // new users statistics

    app.get("/new-users", async (req, res) => {
      try {
        const allUsers = await userCollection
          .find()
          .sort({ createdAt: -1 })
          .limit(10)
          .toArray();

        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);

        const addedLastMonth = await userCollection.countDocuments({
          createdAt: { $gte: lastMonth },
        });

        const totalNewUsers = await userCollection.countDocuments();

        // Group users by day of week
        const chartData = await userCollection
          .aggregate([
            {
              $match: { createdAt: { $gte: lastMonth } },
            },
            {
              $group: {
                _id: { $dayOfWeek: "$createdAt" },
                users: { $sum: 1 },
              },
            },
            {
              $sort: { _id: 1 },
            },
          ])
          .toArray();

        // Convert to day names for chart
        const dayMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const formattedChart = chartData.map((item) => ({
          day: dayMap[item._id - 1],
          users: item.users,
        }));

        res.json({
          users: allUsers,
          addedLastMonth,
          totalNewUsers,
          chart: formattedChart,
        });
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch users" });
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
          renterId,
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

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: price * 100, // Stripe expects the amount in cents
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        console.error("Payment Intent Error:", error);

        // Send more specific error messages based on the error type
        if (error.type === "StripeCardError") {
          res.status(400).send({ error: "Card error: " + error.message });
        } else {
          res.status(500).send({ error: "Internal Server Error" });
        }
      }
    });


    // Notify user when payment is successful
    app.post("/payments", async (req, res) => {
      const paymentInfo = req.body;

      try {
        const result = await paymentsCollection.insertOne(paymentInfo);

        // Send payment notification to user
        await notificationCollection.insertOne({
          userEmail: paymentInfo.email,
          message: `Your payment of $${paymentInfo.amount} was successful.`,
          type: "payment",
          isRead: false,
          createdAt: new Date(),
        });

        res.send({ message: "Payment recorded and notification sent.", result });
      } catch (error) {
        console.error("Error processing payment:", error);
        res.status(500).send({ error: "Failed to process payment" });
      }
    });

    // get payment

    app.get("/payments", async (req, res) => {
      const payment = await paymentsCollection.find().toArray();
      res.send(payment);
    });

    // recent payment

    app.get("/recent-payment", async (req, res) => {
      try {
        const cursor = paymentsCollection.find().sort({ date: -1 }).limit(5);

        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching recent payments:", error);
        res.status(500).send({ message: "Failed to fetch recent payments" });
      }
    });

    app.post("/sslcommerz-payment", async (req, res) => {
      try {
        const result = await initiateSSLCommerzPayment(req, paymentsCollection);

        if (result) {
          const { cus_email, total_amount, tran_id } = result; // Make sure these fields are available in result

          await notificationCollection.insertOne({
            userEmail: cus_email,
            message: `Your payment of $${total_amount} was successfully initiated. Transaction ID: ${tran_id}.`,
            type: "payment",
            isRead: false,
            createdAt: new Date(),
          });
        }

        res.send(result);
      } catch (error) {
        console.error("SSLCommerz Error:", error.message);
        res.status(500).send({ error: "Payment initiation failed" });
      }
    });

    // order post

    app.post("/orders", async (req, res) => {
      const orderData = req.body;

      if (!Array.isArray(orderData)) {
        return res.status(400).send({ error: "Expected an array of orders." });
      }

      try {
        // Loop through the orderData array and insert each order one by one
        const results = [];
        for (const order of orderData) {
          const result = await ordersCollection.insertOne(order);
          results.push(result);
        }

        // Send back the results of all insertions
        res.send({ message: "Orders inserted successfully", results });
      } catch (error) {
        console.error("Order Save Error:", error);
        res.status(500).send({ error: "Failed to save orders." });
      }
    });

    // order get

    app.get("/orders", async (req, res) => {
      const orders = await ordersCollection.find().toArray();

      res.send({ requests: orders });
    });

    // renter earning

    app.get("/renter-orders-summary/:renterId", async (req, res) => {
      const renterId = req.params.renterId;

      try {
        const orders = await ordersCollection.find({ renterId }).toArray();

        const totalOrders = orders.length;

        const totalRevenue = orders.reduce((sum, order) => {
          const price = Number(
            order.price || order.amount || order.totalPrice || 0
          );
          return sum + price;
        }, 0);

        const renterEarnings = totalRevenue * 0.9;
        const adminCommission = totalRevenue * 0.1;

        res.send({
          totalOrders,
          totalRevenue: totalRevenue.toFixed(2),
          renterEarnings: renterEarnings.toFixed(2),
          adminCommission: adminCommission.toFixed(2),
        });
      } catch (error) {
        console.error("Error getting renter summary:", error);
        res.status(500).send({ error: "Failed to calculate earnings." });
      }
    });

    // order update

    // Notify user when order status is updated
    app.patch("/orders/:id", async (req, res) => {
      const orderId = req.params.id;
      const { status } = req.body;

      if (!ObjectId.isValid(orderId)) {
        return res.status(400).send({ error: "Invalid order ID" });
      }

      try {
        const order = await ordersCollection.findOne({ _id: new ObjectId(orderId) });

        if (!order) {
          return res.status(404).send({ error: "Order not found" });
        }

        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(orderId) },
          { $set: { status } }
        );

        // Send notification to user
        await notificationCollection.insertOne({
          userEmail: order.customer_email || order.email,
          message: `Your order #${orderId} status has been updated to "${status}".`,
          type: "order_status",
          isRead: false,
          createdAt: new Date(),
        });

        res.send({ message: "Order status updated and notification sent.", result });
      } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).send({ error: "Failed to update order status" });
      }
    });

    app.get("/orders/api", async (req, res) => {
      const { email } = req.query;
      const query = email ? { email } : {};

      try {
        const result = await ordersCollection.find(query).toArray();
        res.send(result);
      } catch (err) {
        console.error("Error fetching orders:", err);
        res.status(500).send({ error: "Failed to fetch the orders" });
      }

    });

    // recent order

    app.get("/recent-Order", async (req, res) => {
      try {
        const cursor = ordersCollection.find().sort({ date: -1 }).limit(4);

        const result = await cursor.toArray();
        res.send(result);
      } catch (err) {
        console.error("Error fetching orders:", err);
        res.status(500).send({ error: "Failed to fetch the orders" });
      }

    
    });


    app.get("/gadgets/top-rented", async (req, res) => {
      try {
        const topGadgets = await ordersCollection.aggregate([
          {
            $group: {
              _id: "$ProductId",           // Group by gadgetId
              rentCount: { $sum: 1 },     // Count how many times each gadget was rented
            },
          },
          { $sort: { rentCount: -1 } },   // Sort by most rented
          { $limit: 5 },                  // Top 5
          {
            $lookup: {
              from: "gadgets",           // Join with gadgets collection
              localField: "_id",
              foreignField: "_id",
              as: "gadgetInfo",
            },
          },
          { $unwind: "$gadgetInfo" },      // Flatten gadgetInfo array

        ]).toArray();

        res.send(topGadgets);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error fetching top rented gadgets" });
      }
    });


    // monthly order stats
    app.get("/monthly-order", async (req, res) => {
      try {
        const result = await ordersCollection
          .aggregate([
            {
              $addFields: {
                orderDate: { $toDate: "$date" },
              },
            },
            {
              $group: {
                _id: { $month: "$orderDate" },
                total: { $sum: "$amount" },
              },
            },
            { $sort: { _id: 1 } },
          ])
          .toArray();

        const monthNames = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];

        const allMonths = monthNames.map((month) => ({
          name: month,
          value: 0,
        }));

        result.forEach((item) => {
          const index = item._id - 1;
          if (index >= 0 && index < 12) {
            allMonths[index].value = item.total;
          }
        });

        res.send(allMonths);
      } catch (error) {
        console.error("Error fetching monthly sales:", error.message);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // Add a user review
    app.post("/reviews", async (req, res) => {
      const review = req.body;

      if (!review.userId || !review.comment) {
        return res
          .status(400)
          .send({ error: "UserId and comment are required" });
      }

      review.timestamp = new Date(); // Add a timestamp for the review

      try {
        const result = await websitereviewCollection.insertOne(review);
      } catch (error) {
        console.error("Error adding review:", error);
        res.status(500).send({ error: "Failed to add review" });
      }
    });

    // monthly order stats
    app.get("/monthly-order", async (req, res) => {
      try {
        const result = await ordersCollection
          .aggregate([
            {
              $addFields: {
                orderDate: { $toDate: "$date" },
              },
            },
            {
              $group: {
                _id: { $month: "$orderDate" },
                total: { $sum: "$amount" },
              },
            },
            { $sort: { _id: 1 } },
          ])
          .toArray();

        const monthNames = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];

        const allMonths = monthNames.map((month) => ({
          name: month,
          value: 0,
        }));

        result.forEach((item) => {
          const index = item._id - 1;
          if (index >= 0 && index < 12) {
            allMonths[index].value = item.total;
          }
        });

        res.send(allMonths);
      } catch (error) {
        console.error("Error fetching monthly sales:", error.message);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });
    //     review get

    app.get("/websitereview", async (req, res) => {
      const reviews = await websitereviewCollection.find().toArray();
      res.send(reviews);
    })

    // Add a notification
    app.post("/notifications", async (req, res) => {
      const { userEmail, message, type } = req.body;

      try {
        const notification = {
          userEmail,
          message,
          type,
          isRead: false,
          createdAt: new Date(),
        };

        const result = await notificationCollection.insertOne(notification);
        res.send({ message: "Notification added successfully", result });
      } catch (error) {
        console.error("Error adding notification:", error);
        res.status(500).send({ error: "Failed to add notification" });
      }
    });

    // Get all notifications
    app.get("/notifications/all", async (req, res) => {
      try {
        const notifications = await notificationCollection
          .find().toArray();

        res.send(notifications);
      } catch (error) {
        console.error("Error fetching all notifications:", error);
        res.status(500).send({ error: "Failed to fetch notifications" });
      }
    });

    // Get only admin role notifications
    app.get("/notifications/admin", async (req, res) => {
      const { role } = req.query;

      try {
        let notifications;

        if (role === "admin") {
          // Fetch only notifications where role is admin
          notifications = await notificationCollection
            .find({ role: "admin" }) // 🛑 Important filtering here
            .sort({ createdAt: -1 })
            .toArray();
        } else {
          // If not admin, no notifications (or you can handle normally if you want)
          notifications = [];
        }

        res.send(notifications);
      } catch (error) {
        console.error("Error fetching admin notifications:", error);
        res.status(500).send({ error: "Failed to fetch notifications" });
      }
    });

    app.delete("/notifications/admin/all", async (req, res) => {
      try {
        const result = await notificationCollection.deleteMany({ role: "admin" }); // ✅ delete only where role = admin
        res.send({ message: "Admin notifications deleted", deletedCount: result.deletedCount });
      } catch (error) {
        console.error("Error deleting admin notifications:", error);
        res.status(500).send({ error: "Failed to delete admin notifications" });
      }
    });


    // Get notifications for a user
    app.get("/notifications", async (req, res) => {
      const { email } = req.query;

      if (!email) {
        return res.status(400).send({ error: "Email is required" });
      }

      try {
        let notifications;


        // Otherwise, fetch notifications specific to the user
        notifications = await notificationCollection
          .find({ userEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(notifications);
      } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).send({ error: "Failed to fetch notifications" });
      }
    });

    // Mark a notification as read
    app.patch("/notifications/:id", async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid notification ID" });
      }

      try {
        const result = await notificationCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { isRead: true } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({ error: "Notification not found" });
        }

        res.send({ message: "Notification marked as read" });
      } catch (error) {
        console.error("Error marking notification as read:", error);
        res.status(500).send({ error: "Failed to mark notification as read" });
      }
    });

    // Delete a notification
    app.delete("/notifications/:id", async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid notification ID" });
      }

      try {
        const result = await notificationCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).send({ error: "Notification not found" });
        }

        res.send({ message: "Notification deleted successfully" });
      } catch (error) {
        console.error("Error deleting notification:", error);
        res.status(500).send({ error: "Failed to delete notification" });
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
