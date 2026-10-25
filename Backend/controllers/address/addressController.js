const addressService = require("../../services/address/addressService");

function sendMutationError(res, error, operation) {
    console.error(operation + " error:", error);
    const status = Number.isInteger(error.statusCode)
        && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 500;
    return res.status(status).json({
        success: false,
        message: status === 500
            ? "The address could not be saved right now. Please try again."
            : error.message
    });
}


/*
 * Get all addresses belonging to the current user.
 */
async function getAddresses(req, res) {

    try {

        const addresses =
            await addressService.getUserAddresses(
                req.user.id
            );

        return res.status(200).json({
            success: true,
            data: {
                addresses
            }
        });

    } catch (error) {

        console.error(
            "Get addresses error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve addresses"
        });
    }
}


/*
 * Get one address.
 */
async function getAddress(req, res) {

    try {

        const address =
            await addressService.getAddressById(
                req.user.id,
                req.params.id
            );

        if (!address) {

            return res.status(404).json({
                success: false,
                message: "Address not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                address
            }
        });

    } catch (error) {

        console.error(
            "Get address error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve address"
        });
    }
}


/*
 * Create address.
 */
async function createAddress(req, res) {

    try {

        const address =
            await addressService.createAddress(
                req.user.id,
                req.body
            );

        return res.status(201).json({
            success: true,
            message: "Address created successfully",
            data: {
                address
            }
        });

    } catch (error) {

        return sendMutationError(res, error, "Create address");
    }
}


/*
 * Update address.
 */
async function updateAddress(req, res) {

    try {

        const address =
            await addressService.updateAddress(
                req.user.id,
                req.params.id,
                req.body
            );

        return res.status(200).json({
            success: true,
            message: "Address updated successfully",
            data: {
                address
            }
        });

    } catch (error) {

        return sendMutationError(res, error, "Update address");
    }
}


/*
 * Set default address.
 */
async function setDefaultAddress(req, res) {

    try {

        const address =
            await addressService.setDefaultAddress(
                req.user.id,
                req.params.id
            );

        return res.status(200).json({
            success: true,
            message: "Default address updated successfully",
            data: {
                address
            }
        });

    } catch (error) {

        return sendMutationError(res, error, "Set default address");
    }
}


/*
 * Delete address.
 */
async function deleteAddress(req, res) {

    try {

        const address =
            await addressService.deleteAddress(
                req.user.id,
                req.params.id
            );

        return res.status(200).json({
            success: true,
            message: "Address deleted successfully",
            data: {
                address
            }
        });

    } catch (error) {

        return sendMutationError(res, error, "Delete address");
    }
}


module.exports = {
    getAddresses,
    getAddress,
    createAddress,
    updateAddress,
    setDefaultAddress,
    deleteAddress
};