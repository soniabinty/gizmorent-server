const express = require("express");
const cors = require("cors");
require("dotenv").config();

const bcrypt = require("bcrypt");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

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
    const reviewCollection = client.db("gizmorentdb").collection("review");
    const rentalRequestCollection = client.db("gizmorentdb").collection("renter_request");
    const userCollection = client.db("gizmorentdb").collection("users");

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

// app.patch("/approve_renter/:email", async (req, res) => {
//   console.log('Approving renter:', req.params.email); // Debug log to check the email being passed
//   const email = req.params.email;

//   const renterCode = "RENTER-" + Math.random().toString(36).substr(2, 6).toUpperCase();

//   try {
//     const result = await userCollection.updateOne(
//       { email },
//       {
//         $set: {
//           role: "renter",
//           renterCode,
//         },
//       }
//     );

//     if (result.modifiedCount === 0) {
//       return res.status(404).send({ error: "User not found" });
//     }

//     const rentarCollection = client.db("gizmorentdb").collection("rentar");
//     await rentarCollection.insertOne({
//       email,
//       renterCode,
//       createdAt: new Date(),
//     });

//     await rentalRequestCollection.deleteOne({ email });

//     res.send({ modifiedCount: result.modifiedCount, renterCode });
//   } catch (error) {
//     console.error("Approval error:", error);
//     res.status(500).send({ error: "Failed to approve renter" });
//   }
// });


//  renter rejection

// app.delete("/reject_renter/:email", async (req, res) => {
//   const email = req.params.email;

//   try {
//     await rentalRequestCollection.deleteOne({ email });

//     // Optional: Explicitly set to 'user' role
//     await userCollection.updateOne(
//       { email },
//       { $set: { role: "user" } }
//     );

//     res.send({ message: "Renter request rejected" });
//   } catch (error) {
//     res.status(500).send({ error: "Failed to reject request" });
//   }
// });



    // Register User
    app.post("/register", async (req, res) => {
      const { name, email, password, photoURL } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = { name, email, password: hashedPassword, photoURL, failedAttempts: 0, isLocked: false, role: 'user' };
      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });

    // Login User
    app.post("/login", async (req, res) => {
      const { email, password } = req.body;
      const user = await userCollection.findOne({ email });

      if (user && user.isLocked) {
        res.status(403).send({ error: "Account is locked due to multiple failed login attempts." });
        return;
      }

      if (user && await bcrypt.compare(password, user.password)) {
        await userCollection.updateOne({ email }, { $set: { failedAttempts: 0, isLocked: false } });
        res.send({ message: "Login successful", userId: user._id, user });
      } else {
        await userCollection.updateOne({ email }, { $inc: { failedAttempts: 1 } });
        const updatedUser = await userCollection.findOne({ email });
        if (updatedUser.failedAttempts >= 3) {
          await userCollection.updateOne({ email }, { $set: { isLocked: true } });
          res.status(403).send({ error: "Account is locked due to multiple failed login attempts." });
        } else {
          res.status(400).send({ error: "Invalid email or password" });
        }
      }
    });

    // Google Login
    app.post("/google-login", async (req, res) => {
      const { email, displayName, photoURL } = req.body;
      let user = await userCollection.findOne({ email });

      if (!user) {
        user = {
          displayName,
          email,
          photoURL,
          role: 'user',
        };
        await userCollection.insertOne(user);
      }

      res.send({ message: "Login successful", userId: user._id, user });
    });

    app.get("users", async (req, res) => {

      const result = await userCollection.find().toArray();
      res.send(result);

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