import { Response } from "express";
import { HTTP_STATUS, ERROR_MESSAGES } from "../constants";

/**
 * Standard API Response Type
 */
export interface ApiResponse<T = any> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
}

/**
 * Standardized Success Response
 */
export const successResponse = <T = any>(
    res: Response,
    message: string,
    data?: T,
    statusCode: number = HTTP_STATUS.OK
): Response => {
    return res.status(statusCode).json({
        success: true,
        message,
        ...(data && { data }),
    });
};

/**
 * Standardized Error Response
 */
export const errorResponse = (
    res: Response,
    message: string,
    statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    error?: string
): Response => {
    return res.status(statusCode).json({
        success: false,
        message,
        ...(error && { error }),
    });
};

/**
 * Standardized Validation Error Response
 */
export const validationErrorResponse = (
    res: Response,
    errors: any,
    statusCode: number = HTTP_STATUS.BAD_REQUEST
): Response => {
    return res.status(statusCode).json({
        success: false,
        message: "Validation failed",
        errors,
    });
};

/**
 * Create a wrapped async handler to catch errors
 */
export const asyncHandler = (
    fn: (req: any, res: Response) => Promise<any>
) => {
    return (req: any, res: Response) => {
        Promise.resolve(fn(req, res)).catch((error) => {
            console.error(error);
            errorResponse(
                res,
                ERROR_MESSAGES.SERVER_ERROR,
                HTTP_STATUS.INTERNAL_SERVER_ERROR
            );
        });
    };
};
