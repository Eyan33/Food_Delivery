const addressService = require("../../services/address/addressService");


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

        console.error(
            "Create address error:",
            error
        );

        return res.status(400).json({
            success: false,
            message: error.message
        });
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

        console.error(
            "Update address error:",
            error
        );

        return res.status(400).json({
            success: false,
            message: error.message
        });
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

        console.error(
            "Set default address error:",
            error
        );

        return res.status(400).json({
            success: false,
            message: error.message
        });
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

        console.error(
            "Delete address error:",
            error
        );

        return res.status(400).json({
            success: false,
            message: error.message
        });
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