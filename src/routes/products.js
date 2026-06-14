const express = require('express');
const { supabase } = require('../services/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Get all products for the authenticated user (calculates days remaining via urgency view)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('products_with_urgency')
      .select('*')
      .eq('user_id', req.user.id)
      .order('expiry_date', { ascending: true });

    if (error) throw error;

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch products.',
    });
  }
});

// Add a new product
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, code, category, expiryDate, quantity, location } = req.body;

    if (!name || !category || !expiryDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, category, and expiryDate are required.',
      });
    }

    const { data, error } = await req.supabase
      .from('products')
      .insert({
        user_id: req.user.id,
        name,
        code: code || null,
        category,
        expiry_date: expiryDate,
        quantity: quantity ? Number(quantity) : 1,
        location: location || 'Unassigned',
      })
      .select('*')
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error creating product:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create product.',
    });
  }
});

// Update a product
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, category, expiryDate, quantity, location } = req.body;

    const { data, error } = await req.supabase
      .from('products')
      .update({
        name,
        code,
        category,
        expiry_date: expiryDate,
        quantity: quantity ? Number(quantity) : undefined,
        location,
      })
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select('*')
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error updating product:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update product.',
    });
  }
});

// Delete a product
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await req.supabase
      .from('products')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;

    return res.json({
      success: true,
      message: 'Product deleted successfully.',
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete product.',
    });
  }
});

module.exports = router;
