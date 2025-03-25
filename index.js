const express = require("express");
const cors = require("cors");
require("dotenv").config();

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

    const reviewCollection = client.db("gizmorentdb").collection("review");

    const renterCollection = client.db("gizmorentdb").collection("renter");


    // Add a gadget
    app.post("/gadgets", async (req, res) => {
      try {
        const newGadget = req.body;
        const result = await gadgetCollection.insertOne(newGadget);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to add gadget" });
      }
    });

    // Get all gadgets
    app.get("/gadgets", async (req, res) => {
      try {
        const result = await gadgetCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch gadgets" });
      }
    });

    // gadgets filter and search
    app.get("/gadgets/search", async (req, res) => {
      const { query, category, minPrice, maxPrice, sort } = req.query;

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

      // price filter
      if (minPrice || maxPrice) {
        filter.price = {};
        if (minPrice) filter.price.$gte = parseFloat(minPrice);
        if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
      }

      // sort
      let sortOption = {};
      if (sort === "HighToLow") {
        sortOption = { price: -1 };
      } else if (sort === "LowToHigh") {
        sortOption = { price: 1 };
      }

      try {
        const gadgets = await gadgetCollection
          .find(filter)
          .sort(sortOption)
          .toArray();
        res.send(gadgets);
      } catch (error) {
        res.status(500).json({ message: "Error fetching gadgets", error });
      }
    });

    // one gadget by id

    app.get('/gadgets/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await gadgetCollection.findOne(query);
      res.send(result);
    });


    // review get each product

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
    app.post("/renters", async (req, res) => {
      const { email } = req.body;
      const existingRenter = await renterCollection.findOne({ email });

      if (existingRenter) {
        res.status(400).send({ error: "You have already submitted a renter request." });
      } else {
        const newRenter = req.body;
        const result = await renterCollection.insertOne(newRenter);
        res.send(result);
      }
    });

    app.get("/renters", async (req, res) => {
      const result = await renterCollection.find().toArray();
      res.send(result);
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