import mongoose from 'mongoose';

/**
 * Middleware to validate MongoDB ObjectId format in route parameters.
 * Prevents database casting errors, stack traces, and invalid queries.
 * 
 * Usage: router.get('/:id', validateObjectId('id'), controllerFunc);
 */
export const validateObjectId = (paramName = 'id') => (req, res, next) => {
  const id = req.params[paramName];
  if (id && !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid resource ID.'
    });
  }
  next();
};

export default validateObjectId;
