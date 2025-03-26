
const express = require("express");
const cors = require("cors");
require("dotenv").config();


const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

const corsOptions = {
  origin: "http://localhost:5173",
  methods: "GET,POST,DELETE,PUT",
  credentials: true
};
app.use(cors(corsOptions));
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
    const renterCollection = client.db("gizmorentdb").collection("renter");

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
    
        // delete from wishlist
        app.delete("/wishlisted/:id", async (req, res) => {
          const id = req.params.id;
          const query = { _id: new ObjectId(id) };
        
          try {
            const result = await wishlistedCollection.deleteOne(query);
            if (result.deletedCount > 0) {
              res.send({ success: true, message: "Item removed from your wishlist." });
            } else {
              res.status(404).send({ success: false, message: "Item not found in wishlist." });
            }
          } catch (error) {
            res.status(500).send({ success: false, message: "Server error." });
          }
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

    // add from here

 
    
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