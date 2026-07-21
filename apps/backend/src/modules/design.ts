import { Router } from "express";
import { prisma } from "../prisma";
import { auth, internalAuth } from "./middleware";
import type { Request, Response } from "express";
import { randomUUID } from "bullmq";
import { randomUUIDv5, randomUUIDv7 } from "bun";
import { logger } from "./utils";

const designRouter = Router();

/*Routes:
GET    /projects/:projectId/designs               → list Design rows
GET    /projects/:projectId/designs/selected      → the isSelected=true Design
PATCH  /projects/:projectId/designs/:designId     → select a design by id (flips isSelected)
POST   /projects/:projectId/selectDesign          → select a design by htmlContent (flips isSelected)
POST   /projects/:projectId/assets                → upload reference files/images (Stitch input, user uploads)

*/
// save all designs to the db
designRouter.post("/:projectId", internalAuth, async( req: Request, res: Response) =>{
    const {projectId} = req.params;
    const {designs} = req.body

    if (typeof projectId !== "string") {
        return res.status(400).json({
            success: false,
            message: "Invalid projectId",
        });
    }
    let result
    try{
        console.log(`Saving designs to the db`)
        result = await Promise.all(designs.map((design: string) =>
            prisma.design.create({
                data:{
                    id: randomUUIDv7(),
                    projectId,
                    screenId: "",
                    htmlContent: design,
                    createdAt: new Date()
                }
            })
        ))
    } catch(e){
        logger.error(`Error occurred while saving design ${e}`)
        return res.status(500).json({message: `Internal server error`})
    }
    // Echo the created rows back (with ids) so callers can hand a design id
    // to the frontend instead of routing full htmlContent through every hop.
    return res.status(201).json({success: true, data: result})
})
// get all designs
designRouter.get("/:projectId/getDesigns", auth, async (req: Request, res: Response) => {
    const projectId = req.params.projectId;

    if (typeof projectId !== "string") {
        return res.status(400).json({
            success: false,
            message: "Invalid projectId",
        });
    }

    try {
        const designs = await prisma.design.findMany({
            where: {
                projectId: projectId,
            },
        });
        logger.info(`Designs are: ${designs}`)
        return res.status(200).json({
            success: true,
            data: designs,
        });
    } catch (e) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// get selected design
designRouter.get("/:projectId/selectedDesign", auth, async (req: Request, res: Response) => {
    const projectId = req.params.projectId;

    if (typeof projectId !== "string") {
        return res.status(400).json({
            success: false,
            message: "Invalid projectId",
        });
    }

    try {
        const design = await prisma.design.findFirst({
            where: {
                projectId: projectId,
                isSelected: true,
            },
        });

        if (!design) {
            return res.status(404).json({
                success: false,
                message: "Selected design not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: design,
        });
    } catch (e) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});


designRouter.patch("/:projectId/designs/:designId", auth, async (req: Request, res: Response) => {
    const { projectId, designId } = req.params;

    if (
        typeof projectId !== "string" ||
        typeof designId !== "string"
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid params",
        });
    }

    try {
        const design = await prisma.design.findFirst({
            where: {
                id: designId,
                projectId: projectId,
            },
        });

        if (!design) {
            return res.status(404).json({
                success: false,
                message: "Design not found",
            });
        }

        await prisma.design.updateMany({
            where: {
                projectId: projectId,
            },
            data: {
                isSelected: false,
            },
        });

        const selectedDesign = await prisma.design.update({
            where: {
                id: designId,
            },
            data: {
                isSelected: true,
            },
        });

        return res.status(200).json({
            success: true,
            message: "Design selected",
            data: selectedDesign,
        });
    } catch (e) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

designRouter.post("/:projectId/selectDesign", auth, async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const { htmlContent } = req.body;

    if (typeof projectId !== "string" || typeof htmlContent !== "string") {
        return res.status(400).json({
            success: false,
            message: "Invalid params",
        });
    }

    try {
        const design = await prisma.design.findFirst({
            where: {
                projectId,
                htmlContent,
            },
        });

        if (!design) {
            return res.status(404).json({
                success: false,
                message: "Design not found",
            });
        }

        await prisma.design.updateMany({
            where: { projectId },
            data: { isSelected: false },
        });

        const selectedDesign = await prisma.design.update({
            where: { id: design.id },
            data: { isSelected: true },
        });

        return res.status(200).json({
            success: true,
            message: "Design selected",
            data: selectedDesign,
        });
    } catch (e) {
        logger.error(`Error occurred while selecting design ${e}`)
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

// designRouter.post("/:projectId/assets", auth, async (req: Request, res: Response) => {
//     const projectId = req.params.projectId;

//     const {
//         fileName,
//         fileUrl,
//         mimeType,
//     } = req.body;

//     if (typeof projectId !== "string") {
//         return res.status(400).json({
//             success: false,
//             message: "Invalid projectId",
//         });
//     }

//     try {
//         const project = await prisma.project.findUnique({
//             where: {
//                 id: projectId,
//             },
//         });

//         if (!project) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Project not found",
//             });
//         }

//         const asset = await prisma.design.create({
//             data: {
//                 id: 
//                 projectId: projectId,
//                 fileName: fileName,
//                 fileUrl: fileUrl,
//                 mimeType: mimeType,
//             },
//         });

//         return res.status(201).json({
//             success: true,
//             message: "Asset uploaded",
//             data: asset,
//         });
//     } catch (e) {
//         return res.status(500).json({
//             success: false,
//             message: "Internal server error",
//         });
//     }
// });

export default designRouter;