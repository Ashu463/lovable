import { Router } from "express";
import { prisma } from "../prisma";
import { auth, internalAuth } from "./middleware";
import type { Request, Response } from "express";
import { randomUUID } from "bullmq";
import { randomUUIDv5, randomUUIDv7 } from "bun";
import { logger } from "./utils";
import { created, notFound, ok, requireStrings, serverError } from "./http";

const designRouter = Router();

// Exactly one design per project may be selected, so selecting always means
// clearing the project's flags first.
async function markDesignSelected(projectId: string, designId: string) {
    await prisma.design.updateMany({
        where: { projectId },
        data: { isSelected: false },
    });
    return prisma.design.update({
        where: { id: designId },
        data: { isSelected: true },
    });
}

/*Routes:
GET    /projects/:projectId/designs               → list Design rows
GET    /projects/:projectId/designs/selected      → the isSelected=true Design
PATCH  /projects/:projectId/designs/:designId     → select a design by id (flips isSelected)
POST   /projects/:projectId/selectDesign          → select a design by htmlContent (flips isSelected)
POST   /projects/:projectId/assets                → upload reference files/images (Stitch input, user uploads)

*/
// save all designs to the db
designRouter.post("/:projectId", internalAuth, async( req: Request, res: Response) =>{
    const {designs} = req.body

    const params = requireStrings(res, { projectId: req.params.projectId });
    if (!params) return;
    const { projectId } = params;

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
        return serverError(res)
    }
    // Echo the created rows back (with ids) so callers can hand a design id
    // to the frontend instead of routing full htmlContent through every hop.
    return created(res, result)
})
// get all designs
designRouter.get("/:projectId/getDesigns", auth, async (req: Request, res: Response) => {
    const params = requireStrings(res, { projectId: req.params.projectId });
    if (!params) return;
    const { projectId } = params;

    try {
        const designs = await prisma.design.findMany({
            where: {
                projectId: projectId,
            },
        });
        logger.info(`Designs are: ${designs}`)
        return ok(res, designs);
    } catch (e) {
        return serverError(res);
    }
});

// get selected design
designRouter.get("/:projectId/selectedDesign", auth, async (req: Request, res: Response) => {
    const params = requireStrings(res, { projectId: req.params.projectId });
    if (!params) return;
    const { projectId } = params;

    try {
        const design = await prisma.design.findFirst({
            where: {
                projectId: projectId,
                isSelected: true,
            },
        });

        if (!design) {
            return notFound(res, "Selected design not found");
        }

        return ok(res, design);
    } catch (e) {
        return serverError(res);
    }
});


designRouter.patch("/:projectId/designs/:designId", auth, async (req: Request, res: Response) => {
    const params = requireStrings(res, { projectId: req.params.projectId, designId: req.params.designId });
    if (!params) return;
    const { projectId, designId } = params;

    try {
        const design = await prisma.design.findFirst({
            where: {
                id: designId,
                projectId: projectId,
            },
        });

        if (!design) {
            return notFound(res, "Design not found");
        }

        const selectedDesign = await markDesignSelected(projectId, designId);

        return ok(res, selectedDesign, "Design selected");
    } catch (e) {
        return serverError(res);
    }
});

designRouter.post("/:projectId/selectDesign", auth, async (req: Request, res: Response) => {
    const { htmlContent } = req.body;

    const params = requireStrings(res, { projectId: req.params.projectId, htmlContent });
    if (!params) return;
    const { projectId } = params;

    try {
        const design = await prisma.design.findFirst({
            where: {
                projectId,
                htmlContent,
            },
        });

        if (!design) {
            return notFound(res, "Design not found");
        }

        const selectedDesign = await markDesignSelected(projectId, design.id);

        return ok(res, selectedDesign, "Design selected");
    } catch (e) {
        logger.error(`Error occurred while selecting design ${e}`)
        return serverError(res);
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