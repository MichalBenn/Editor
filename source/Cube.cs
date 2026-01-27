using System;
using System.Collections;
using MV.Common;
using UnityEngine;
using System.Collections.Generic;
using MV.WorldObject;
using System.Linq;


public enum Face:int
{
    Top = 0,
    Bottom = 1,
    Front = 2,
    Back = 3,
    Left = 4,
    Right = 5,

}

[Flags]
public enum FaceFlags : byte
{
    Top = 0x1,
    Bottom = 0x2,
    Front = 0x4,
    Back = 0x8,
    Left = 0x10,
    Right = 0x20,
}

public enum Edge
{
    None = 0,
    Front,
    Back,
    Left,
    Right
}

public enum Corner
{
    TopLeftFront,
    TopRightFront,
    TopRightBack,
    TopLeftBack,
    BottomLeftBack,
    BottomRightBack,
    BottomRightFront,
    BottomLeftFront
}

public enum Axis
{
    All,
    X,
    Y,
    Z
}

public class CubePickingInfo
{
    public Cube cube;
    public Face pickedFace;
    public Edge pickedEdge;
    public bool pickedEdgeIndex0;
    public bool pickedEdgeIndex1;
    public Vector3 normal;
    public Vector3 point;
    public IntVector iLocalPos;

    public CubePickingInfo()
    {

    }
    public CubePickingInfo(CubePickingInfo cubePickingInfo)
    {
        cube = cubePickingInfo.cube;
        pickedFace = cubePickingInfo.pickedFace;
        pickedEdge = cubePickingInfo.pickedEdge;
        normal = cubePickingInfo.normal;
        point = cubePickingInfo.point;
        iLocalPos = cubePickingInfo.iLocalPos;
    }


}


public struct Cell
{
    public Cube cube;
    public byte lightValue;

    public Cell(Cube cube, byte lightValue)
    {
        this.cube = cube;
        this.lightValue = lightValue;
    }

    public Cell Clone()
    {
        return new Cell(Cube.Clone(cube), lightValue);
    }

}

public class Cube
{
    //Warning Cube class is currently not threadsafe!
    static Vector3[] cornersBookkeeping = new Vector3[8];
    private static byte[] identityByteCorners = {
                                                    20, 120, 124, 24, 4, 104, 100, 0
                                                };

    public static byte[] IdentityByteCorners { get { return (byte[])identityByteCorners.Clone(); } }

    public static Vector3[] IdentityCorners { get { return CubeDataPacker.ByteArrayToCorners(identityByteCorners); } }
    //public static byte[] IdentityByteCorners {get {}}

    private static readonly FaceFlags[] faceFlagsArray = (FaceFlags[])Enum.GetValues(typeof(FaceFlags));

    public static FaceFlags[] FaceFlagsArray
    {
        get { return faceFlagsArray; }
    }

    
    public Vector3[] Corners { get { return CubeDataPacker.ByteArrayToCorners(byteCorners); } set { byteCorners = CubeDataPacker.CornersToByteArray(value); } }
    public byte[] ByteCorners { get { return byteCorners; } }
    public byte[] FaceMaterials { get { return faceMaterials; } }

    public byte UnIndentedSides
    {
        get { return unIndentedSides; }
        set { unIndentedSides = value; }
    }

    public byte HiddenSides
    {
        get { return hiddenSides; }
        set { hiddenSides = value; }
    }



    private byte unIndentedSides = 0;
    private byte hiddenSides = 0;
    private byte[] byteCorners = (byte[])identityByteCorners.Clone();
    private byte[] faceMaterials = new byte[6];
    


    public Cube(byte[] byteCorners, byte[] faceMaterials)
    {

        this.byteCorners = byteCorners;
        this.faceMaterials = faceMaterials;

    }



    public Cube(BytePacker bp, Byte byteFlags)
    {
        CubeDataPacker.ReadCompressedCube(byteFlags, bp, ref byteCorners, ref faceMaterials);
        SetCubeFlags(this);

    }
    

    public static byte[] CreateMaterialArray(byte material)
    {
        return new byte[] {material, material, material, material, material, material};
    }

    public static Cube Clone(Cube original)
    {
        if (original == null) return null;
        Cube clone = new Cube((byte[])original.byteCorners.Clone(), (byte[])original.faceMaterials.Clone());
        SetCubeFlags(clone);
        return clone;
    }


    public override bool Equals(System.Object obj)
    {
        // If parameter is null return false.
        if (obj == null)
        {
            return false;
        }

        // If parameter cannot be cast to Point return false.
        Cube cube = obj as Cube;
        if ((System.Object)cube == null)
        {
            return false;
        }

        // Return true if the fields match:
        return Equals(cube);
    }

    public bool Equals(Cube cube)
    {
        // If parameter is null return false:
        if ((object)cube == null)
        {
            return false;
        }

        if (byteCorners.Length != cube.byteCorners.Length) return false;
        if (faceMaterials.Length != cube.faceMaterials.Length) return false;


        for (int i = 0; i < byteCorners.Length; i++)
        {
            if (byteCorners[i] != cube.byteCorners[i]) return false;
        }
        for (int i = 0; i < faceMaterials.Length; i++)
        {
            if (faceMaterials[i] != cube.faceMaterials[i]) return false;
        }
        return true;
    }

    public static bool operator ==(Cube a, Cube b)
    {
        // If both are null, or both are same instance, return true.
        if (System.Object.ReferenceEquals(a, b))
        {
            return true;
        }

        // If one is null, but not both, return false.
        if (((object)a == null) || ((object)b == null))
        {
            return false;
        }

        return a.Equals(b);
    }

    public static bool operator !=(Cube a, Cube b)
    {
        return !(a == b);
    }
    public override int GetHashCode()
    {
        int i = 0;
        foreach (byte byteCorner in byteCorners)
        {
            i += byteCorner;
        }
        foreach (byte faceMaterial in faceMaterials)
        {
            i += faceMaterial;
        }
        return i;
    }

    public static void GetCorners(Cube cube, ref Vector3[] corners)
    {
        CubeDataPacker.ByteArrayToCorners(ref cube.byteCorners, ref corners);
    }

    public static void SetCubeFlags(Cube cube)
    {
        //TODO: temp sync of bytecorners
        cube.unIndentedSides = 0;

        bool[] isCornerTouched = new bool[8];
        int touchedCornersCounter = 0;
        for (int i = 0; i < 8; i++)
        {
            isCornerTouched[i] = cube.byteCorners[i] != identityByteCorners[i];
            if (isCornerTouched[i])
            {
                touchedCornersCounter++;
            }

        }

        //early out cube is identity cube
        if (touchedCornersCounter == 0)
        {
            cube.unIndentedSides = 0x3F;
            //Debug.Log(cube.unIndentedSides);
            return;

        }

        //early out, at least 4 cornes must be untouched for a face to be untouched

        if (touchedCornersCounter >= 4)
        {
            cube.unIndentedSides = 0x0;
            return;
        }




        if (isCornerTouched[(int)Corner.TopLeftFront] && isCornerTouched[(int)Corner.TopRightFront]
             && isCornerTouched[(int)Corner.TopRightBack]
             && isCornerTouched[(int)Corner.TopLeftBack])
        {
            cube.unIndentedSides |= (byte)FaceFlags.Top;
        }

        if (isCornerTouched[(int)Corner.BottomLeftBack] && isCornerTouched[(int)Corner.BottomRightBack]
             && isCornerTouched[(int)Corner.BottomRightFront]
             && isCornerTouched[(int)Corner.BottomLeftFront])
        {
            cube.unIndentedSides |= (byte)FaceFlags.Bottom;
        }


        if (isCornerTouched[(int)Corner.TopRightBack] && isCornerTouched[(int)Corner.TopLeftBack]
             && isCornerTouched[(int)Corner.BottomLeftBack]
             && isCornerTouched[(int)Corner.BottomRightBack])
        {
            cube.unIndentedSides |= (byte)FaceFlags.Back;
        }

        if (isCornerTouched[(int)Corner.TopLeftFront] && isCornerTouched[(int)Corner.TopRightFront]
             && isCornerTouched[(int)Corner.BottomRightFront]
             && isCornerTouched[(int)Corner.BottomLeftFront])
        {
            cube.unIndentedSides |= (byte)FaceFlags.Front;
        }
        if (isCornerTouched[(int)Corner.TopLeftFront] && isCornerTouched[(int)Corner.TopLeftBack]
     && isCornerTouched[(int)Corner.BottomLeftBack]
     && isCornerTouched[(int)Corner.BottomLeftFront])
        {
            cube.unIndentedSides |= (byte)FaceFlags.Left;
        }

        if (isCornerTouched[(int)Corner.TopRightFront] && isCornerTouched[(int)Corner.TopRightBack]
             && isCornerTouched[(int)Corner.BottomRightBack]
             && isCornerTouched[(int)Corner.BottomRightFront])
        {
            cube.unIndentedSides |= (byte)FaceFlags.Right;
        }





    }


    public static Vector3[] GetCorners(Cube cube, Face face)
    {
        Vector3[] faceVertices = GetFace(cube.Corners, face);
        return GetCorners(faceVertices, face).ToArray();
        //Create(cube, cube.corners, materialId);
    }


    public static void SetMaterial(Cube cube, Face face, byte materialId)
    {
        // TODO: Sanity checking here...
        cube.faceMaterials[(int)face] = materialId;
    }

    public static byte GetMaterial(Cube cube, Face face)
    {
        return cube.faceMaterials[(int)face];
    }


    public static Vector3[] GetVertices(Cube cube)
    {
        return GetVertices(cube.Corners);
    }


    public static Face GetFaceIdentityFromLocalDir(Vector3 localDir)
    {
        Vector3 absLocalDir = MathFunctions.AbsVector(localDir);
        //Debug.Log("localDir " + localDir);
        if (absLocalDir.x >= absLocalDir.y && absLocalDir.x >= absLocalDir.z)
        {
            if (localDir.x < 0)
            {
                return Face.Left;
            }
            return Face.Right;
        }
        if (absLocalDir.y >= absLocalDir.x && absLocalDir.y >= absLocalDir.z)
        {
            if (localDir.y < 0)
            {
                return Face.Bottom;
            }
            return Face.Top;
        }
        if (absLocalDir.z >= absLocalDir.x && absLocalDir.z >= absLocalDir.y)
        {
            if (localDir.z < 0)
            {
                return Face.Front;
            }
            return Face.Back;
        }
        Debug.LogError("no face found");
        return Face.Front;
    }

    public static Vector3 GetFaceAxis(Face face)
    {
        switch (face)
        {
            case Face.Top:
                return Vector3.up;
            case Face.Bottom:
                return Vector3.down;
            case Face.Left:
                return Vector3.left;
            case Face.Right:
                return Vector3.right;
            case Face.Front:
                return Vector3.back;
            case Face.Back:
                return Vector3.forward;
        }
        return Vector3.zero;
    }

    public static List<Vector3> GetCorners(List<Vector2> clockwiseCorners, Face direction)
    {
        List<Vector3> cubeCorners = SquareCornersToCubeCorners(clockwiseCorners, direction);
        return cubeCorners;
    }

    public static void SetFace(Cube cube, Face face, Vector3[] faceVertices)
    {
        cornersBookkeeping = cube.Corners;
        SetFace(ref cornersBookkeeping, face, faceVertices);
        cube.Corners = cornersBookkeeping;

    }
    public static bool IsFaceBoxSideAligened(Cube cube, Face face)
    {
        Vector3[] faceVertices = GetFace(RotateFaceToTop(cube, face), face);
        float y = 0.5f;
        for (int i = 0; i < 4; i++)
        {
            if (y != faceVertices[i].y)
            {
                return false;
            }

        }
        return true;
    }



    public static void UnIndentFace(Cube cube, Face face)
    {

        Vector3[] faceVertices = GetFace(RotateFaceToTop(cube, face), face);
        float y = 0.5f;
        for (int i = 0; i < 4; i++)
        {
            faceVertices[i].y = y;
        }

        Quaternion rotation = GetFromTopRotation(face);
        for (int i = 0; i < faceVertices.Length; i++)
        {
            Vector3 corner = (rotation * faceVertices[i]);
            MathFunctions.RoundVector(ref corner, 3);
            faceVertices[i] = corner;
        }

        SetFace(cube, face, faceVertices);
    }

    public static Vector3[] GetVerticesWorldAxisAligned(Cube cube, IntVector iVector)
    {
        Vector3[] verts = GetVertices(cube.Corners);

        Vector3 localPos = new Vector3(iVector.x, iVector.y, iVector.z);


        for (int i = 0; i < verts.Length; i++)
        {
            verts[i] = localPos + verts[i];
        }


        return verts;
    }

    static void GetAverageLightValue(Face face, int vertex, Cells cells, IntVector arrayPos, ref Color color)
    {
        int faceVertex = ((int) face)*4  + vertex;

        IntVector[] offsets = SharedCubeFunctions.LightTestOffsets[faceVertex];

        int accLightValue = 0;
        for(int i= 0; i< 4; i++ )
        {
            IntVector lightPos = offsets[i] + arrayPos;

            if(cells.IsWithinArrayCoordsRange(lightPos))
            {
                //Debug.Log("is within range");
                accLightValue += cells[lightPos].lightValue;
            }
            
        }

        color.r = ((float)accLightValue)/(4*255);
        color.b = ((float)accLightValue) / (4 * 255);
        color.g = ((float)accLightValue) / (4 * 255);


    }

    public static void GetVisibleFaceVertices(Cube cube, ref CubeModelChunk.FaceData[] faceData, IntVector iVector, IntVector arrayPos, Cells cells, ref int index)
    {


        Vector3 localPos = new Vector3(iVector.x, iVector.y, iVector.z);
        //Top
        //cornersBookkeeping = cube.Corners;

        Cube.GetCorners(cube, ref cornersBookkeeping);

        index = 0;
        if ((cube.hiddenSides & (byte)FaceFlags.Top) == 0)
        {
            faceData[index].face = Face.Top;
            faceData[index].faceVertices[0] = localPos + cornersBookkeeping[0];
            GetAverageLightValue(faceData[index].face, 0, cells, arrayPos, ref faceData[index].colors[0]);
            faceData[index].faceVertices[1] = localPos + cornersBookkeeping[1];
            GetAverageLightValue(faceData[index].face, 1, cells, arrayPos, ref faceData[index].colors[1]);
            faceData[index].faceVertices[2] = localPos + cornersBookkeeping[2];
            GetAverageLightValue(faceData[index].face, 2, cells, arrayPos, ref faceData[index].colors[2]);
            faceData[index].faceVertices[3] = localPos + cornersBookkeeping[3];
            GetAverageLightValue(faceData[index].face, 3, cells, arrayPos, ref faceData[index].colors[3]);
            index++;
        }

        if ((cube.hiddenSides & (byte)FaceFlags.Bottom) == 0)
        {
            faceData[index].face = Face.Bottom;
            faceData[index].faceVertices[0] = localPos + cornersBookkeeping[4];
            GetAverageLightValue(faceData[index].face, 0, cells, arrayPos, ref faceData[index].colors[0]);
            faceData[index].faceVertices[1] = localPos + cornersBookkeeping[5];
            GetAverageLightValue(faceData[index].face, 1, cells, arrayPos, ref faceData[index].colors[1]);
            faceData[index].faceVertices[2] = localPos + cornersBookkeeping[6];
            GetAverageLightValue(faceData[index].face, 2, cells, arrayPos, ref faceData[index].colors[2]);
            faceData[index].faceVertices[3] = localPos + cornersBookkeeping[7];
            GetAverageLightValue(faceData[index].face, 3, cells, arrayPos, ref faceData[index].colors[3]);
            index++;
        }

        if ((cube.hiddenSides & (byte)FaceFlags.Front) == 0)
        {
            faceData[index].face = Face.Front;
            faceData[index].faceVertices[0] = localPos + cornersBookkeeping[7];
            GetAverageLightValue(faceData[index].face, 0, cells, arrayPos, ref faceData[index].colors[0]);
            faceData[index].faceVertices[1] = localPos + cornersBookkeeping[6];
            GetAverageLightValue(faceData[index].face, 1, cells, arrayPos, ref faceData[index].colors[1]);
            faceData[index].faceVertices[2] = localPos + cornersBookkeeping[1];
            GetAverageLightValue(faceData[index].face, 2, cells, arrayPos, ref faceData[index].colors[2]);
            faceData[index].faceVertices[3] = localPos + cornersBookkeeping[0];
            GetAverageLightValue(faceData[index].face, 3, cells, arrayPos, ref faceData[index].colors[3]);
            index++;
        }

        if ((cube.hiddenSides & (byte)FaceFlags.Back) == 0)
        {
            faceData[index].face = Face.Back;
            faceData[index].faceVertices[0] = localPos + cornersBookkeeping[5];
            GetAverageLightValue(faceData[index].face, 0, cells, arrayPos, ref faceData[index].colors[0]);
            faceData[index].faceVertices[1] = localPos + cornersBookkeeping[4];
            GetAverageLightValue(faceData[index].face, 1, cells, arrayPos, ref faceData[index].colors[1]);
            faceData[index].faceVertices[2] = localPos + cornersBookkeeping[3];
            GetAverageLightValue(faceData[index].face, 2, cells, arrayPos, ref faceData[index].colors[2]);
            faceData[index].faceVertices[3] = localPos + cornersBookkeeping[2];
            GetAverageLightValue(faceData[index].face, 3, cells, arrayPos, ref faceData[index].colors[3]);
            index++;
        }

        if ((cube.hiddenSides & (byte)FaceFlags.Left) == 0)
        {
            faceData[index].face = Face.Left;
            faceData[index].faceVertices[0] = localPos + cornersBookkeeping[4];
            GetAverageLightValue(faceData[index].face, 0, cells, arrayPos, ref faceData[index].colors[0]);
            faceData[index].faceVertices[1] = localPos + cornersBookkeeping[7];
            GetAverageLightValue(faceData[index].face, 1, cells, arrayPos, ref faceData[index].colors[1]);
            faceData[index].faceVertices[2] = localPos + cornersBookkeeping[0];
            GetAverageLightValue(faceData[index].face, 2, cells, arrayPos, ref faceData[index].colors[2]);
            faceData[index].faceVertices[3] = localPos + cornersBookkeeping[3];
            GetAverageLightValue(faceData[index].face, 3, cells, arrayPos, ref faceData[index].colors[3]);
            index++;
        }

        if ((cube.hiddenSides & (byte)FaceFlags.Right) == 0)
        {
            faceData[index].face = Face.Right;
            faceData[index].faceVertices[0] = localPos + cornersBookkeeping[6];
            GetAverageLightValue(faceData[index].face, 0, cells, arrayPos, ref faceData[index].colors[0]);
            faceData[index].faceVertices[1] = localPos + cornersBookkeeping[5];
            GetAverageLightValue(faceData[index].face, 1, cells, arrayPos, ref faceData[index].colors[1]);
            faceData[index].faceVertices[2] = localPos + cornersBookkeeping[2];
            GetAverageLightValue(faceData[index].face, 2, cells, arrayPos, ref faceData[index].colors[2]);
            faceData[index].faceVertices[3] = localPos + cornersBookkeeping[1];
            GetAverageLightValue(faceData[index].face, 3, cells, arrayPos, ref faceData[index].colors[3]);
            index++;
        }


    }

    /*public static void GetVisibleFaceVertices(Cube cube, ref Dictionary<Face, Vector3[]> cubeFaces, IntVector iVector)
    {


        Vector3 localPos = new Vector3(iVector.x, iVector.y, iVector.z);
        //Top
        cornersBookkeeping = cube.Corners;




        if ((cube.hiddenSides & (byte)FaceFlags.Top) == 0)
        {

            cubeFaces[Face.Top] = new Vector3[]
                                      {
                                localPos + cornersBookkeeping[0],
                                localPos + cornersBookkeeping[1],
                                localPos + cornersBookkeeping[2],
                                localPos + cornersBookkeeping[3],
                                      };
        }

        if ((cube.hiddenSides & (byte)FaceFlags.Bottom) == 0)
        {


            cubeFaces[Face.Bottom] = new Vector3[]
                                      {
                                localPos + cornersBookkeeping[4],
                                localPos + cornersBookkeeping[5],
                                localPos + cornersBookkeeping[6],
                                localPos + cornersBookkeeping[7],
                                      };
        }

        if ((cube.hiddenSides & (byte)FaceFlags.Front) == 0)
        {

            cubeFaces[Face.Front] = new Vector3[]
                                      {
                                localPos + cornersBookkeeping[7],
                                localPos + cornersBookkeeping[6],
                                localPos + cornersBookkeeping[1],
                                localPos + cornersBookkeeping[0],
                                      };
        }

        if ((cube.hiddenSides & (byte)FaceFlags.Back) == 0)
        {

            cubeFaces[Face.Back] = new Vector3[]
                                      {
                                localPos + cornersBookkeeping[5],
                                localPos + cornersBookkeeping[4],
                                localPos + cornersBookkeeping[3],
                                localPos + cornersBookkeeping[2],
                                      };
        }

        if ((cube.hiddenSides & (byte)FaceFlags.Left) == 0)
        {

            cubeFaces[Face.Left] = new Vector3[]
                                      {
                                localPos + cornersBookkeeping[4],
                                localPos + cornersBookkeeping[7],
                                localPos + cornersBookkeeping[0],
                                localPos + cornersBookkeeping[3],
                                      };
        }

        if ((cube.hiddenSides & (byte)FaceFlags.Right) == 0)
        {

            cubeFaces[Face.Right] = new Vector3[]
                                      {
                                localPos + cornersBookkeeping[6],
                                localPos + cornersBookkeeping[5],
                                localPos + cornersBookkeeping[2],
                                localPos + cornersBookkeeping[1],
                                      };
        }


    }*/

    public static Face GetFace(Vector3[] corners, Vector3[] triangleVertices)
    {
        foreach (Face face in Enum.GetValues(typeof(Face)))
        {
            int triangleVerticesInFace = 0;
            Vector3[] faceVertices = GetFace(corners, face);
            foreach (Vector3 triangleVertex in triangleVertices)
            {
                foreach (Vector3 faceVertex in faceVertices)
                {
                    if ((triangleVertex - faceVertex).magnitude < 0.001)
                    {
                        triangleVerticesInFace++;
                        break;
                    }
                }
            }
            if (triangleVerticesInFace == 3)
            {
                return face;
            }
        }
        return 0;
    }


    public static Face FaceFlagToFace(FaceFlags faceFlag)
    {
        switch (faceFlag)
        {
            case FaceFlags.Top:
                return Face.Top;
            case FaceFlags.Bottom:
                return Face.Bottom;
            case FaceFlags.Front:
                return Face.Front;
            case FaceFlags.Back:
                return Face.Back;
            case FaceFlags.Left:
                return Face.Left;
            case FaceFlags.Right:
                return Face.Right;

        }
        return 0;
    }

    public static Vector3[] GetFace(Vector3[] corners, Face face)
    {
        Vector3[] faceVertices = new Vector3[4];
        GetFace(ref corners, ref faceVertices, face);
        return faceVertices;

    }

    public static void GetFace(ref Vector3[] corners, ref Vector3[] faceVertices, Face face)
    {

        switch (face)
        {

            case Face.Top:
                faceVertices[0] = corners[0];
                faceVertices[1] = corners[1];
                faceVertices[2] = corners[2];
                faceVertices[3] = corners[3];

                break;
            case Face.Bottom:
                faceVertices[0] = corners[4];
                faceVertices[1] = corners[5];
                faceVertices[2] = corners[6];
                faceVertices[3] = corners[7];
                break;
            case Face.Back:
                faceVertices[0] = corners[5];
                faceVertices[1] = corners[4];
                faceVertices[2] = corners[3];
                faceVertices[3] = corners[2];
                break;
            case Face.Front:
                faceVertices[0] = corners[7];
                faceVertices[1] = corners[6];
                faceVertices[2] = corners[1];
                faceVertices[3] = corners[0];
                break;
            case Face.Left:
                faceVertices[0] = corners[4];
                faceVertices[1] = corners[7];
                faceVertices[2] = corners[0];
                faceVertices[3] = corners[3];
                break;
            case Face.Right:
                faceVertices[0] = corners[6];
                faceVertices[1] = corners[5];
                faceVertices[2] = corners[2];
                faceVertices[3] = corners[1];
                break;
        }
    }


    public static Vector3[] GetFaceVerticesWorld(GameObject gameObject, Cube cube, Face face, IntVector iVector)
    {

        Vector3 localPos = new Vector3(iVector.x, iVector.y, iVector.z);

        Vector3[] faceVerts = GetFace(cube.Corners, face);

        faceVerts[0] = gameObject.transform.TransformPoint(faceVerts[0] + localPos);
        faceVerts[1] = gameObject.transform.TransformPoint(faceVerts[1] + localPos);
        faceVerts[2] = gameObject.transform.TransformPoint(faceVerts[2] + localPos);
        faceVerts[3] = gameObject.transform.TransformPoint(faceVerts[3] + localPos);

        return faceVerts;
    }

    public static Vector3[] GetEdge(Cube cube, Face face, Edge edge)
    {


        Vector3[] faceVertices = GetFace(cube.Corners, face);
        Vector3[] edgeVertices = new Vector3[2];

        switch (edge)
        {
            case Edge.Front:
                edgeVertices[0] = faceVertices[0];
                edgeVertices[1] = faceVertices[1];
                break;
            case Edge.Back:
                edgeVertices[0] = faceVertices[2];
                edgeVertices[1] = faceVertices[3];
                break;
            case Edge.Left:
                edgeVertices[0] = faceVertices[3];
                edgeVertices[1] = faceVertices[0];
                break;
            case Edge.Right:
                edgeVertices[0] = faceVertices[1];
                edgeVertices[1] = faceVertices[2];
                break;
        }
        return edgeVertices;

    }

    public static void SetEdge(Cube cube, Face face, Edge edge, Vector3[] edgeVertices)
    {

        cornersBookkeeping = cube.Corners;
        SetEdge(ref cornersBookkeeping, face, edge, edgeVertices);

        cube.Corners = cornersBookkeeping;

    }

    public static Edge GetEdge(GameObject gameObject, Cube cube, Face face, Vector3 pos, IntVector iVector)
    {
        //pos = cubeModel.transform.InverseTransformPoint(pos);
        float posToEdgeDistance = 1000.0f;

        Edge edge = Edge.None;

        foreach (Edge val in Enum.GetValues(typeof(Edge)))
        {
            Vector3[] curEdge = GetEdgeVerticesWorld(gameObject, cube, face, val, iVector);
            float curPosToEdgeDistance = 1000;
            MathFunctions.DistancePointLine(pos, curEdge[0], curEdge[1], ref curPosToEdgeDistance);

            if (posToEdgeDistance > curPosToEdgeDistance)
            {
                edge = val;
                posToEdgeDistance = curPosToEdgeDistance;
            }
        }
        return edge;


    }

    public static Vector3[] GetEdgeVerticesWorld(GameObject gameObject, Cube cube, Face face, Edge edge, IntVector iVector)
    {
        Vector3 localPos = new Vector3(iVector.x, iVector.y, iVector.z);

        Vector3[] edgeVertices = GetEdge(cube, face, edge);
        edgeVertices[0] = gameObject.transform.TransformPoint(edgeVertices[0] + localPos);
        edgeVertices[1] = gameObject.transform.TransformPoint(edgeVertices[1] + localPos);


        return edgeVertices;
    }


    static bool IsOutOfBound(Vector3[] corners)
    {
        foreach (Vector3 vector3 in corners)
        {
            for (int i = 0; i < 3; i++)
            {
                if (Mathf.Abs(vector3[i]) > 0.5f)
                {
                    return true;
                }
            }
        }
        return false;
    }

    public static void SetVertex()
    {

    }

    public static void MoveVertex(CubePickingInfo info, float value, Vector3 axis, bool edgeIndex0, bool edgeIndex1, ref CubeOutOfBoundState coob)
    {
        /*float collapseEdgeFactor = 0.001f;
        value -= (value/Mathf.Abs(value))*collapseEdgeFactor;*/



        Vector3[] edgeVertices = GetEdge(info.cube, info.pickedFace, info.pickedEdge);
        Vector3[] testEdgeVertices = GetEdge(info.cube, info.pickedFace, info.pickedEdge);

        if (edgeIndex0)
        {
            edgeVertices[0] = edgeVertices[0] + (value * axis);
        }
        if (edgeIndex1)
        {
            edgeVertices[1] = edgeVertices[1] + (value * axis);
        }


        float min = -0.5f;
        float max = 0.5f;


        MathFunctions.ClampVector(ref edgeVertices[0], min, max);
        MathFunctions.ClampVector(ref edgeVertices[1], min, max);

        MathFunctions.RoundVector(ref edgeVertices[0], 3);
        MathFunctions.RoundVector(ref edgeVertices[1], 3);

        Vector3[] corners = (Vector3[])info.cube.Corners.Clone();

        SetEdge(ref corners, info.pickedFace, info.pickedEdge, edgeVertices);
        if (IsLegal(corners))
        {
            SetEdge(info.cube, info.pickedFace, info.pickedEdge, edgeVertices);
            if (testEdgeVertices[0] != edgeVertices[0] || testEdgeVertices[1] != edgeVertices[1])
            {
                coob = CubeOutOfBoundState.WithinBounds;    
            }

            
        }
    }

    public static void MoveEdge(CubePickingInfo info, float value, Vector3 axis, ref CubeOutOfBoundState coob)
    {
        /*float collapseEdgeFactor = 0.001f;
        value -= (value/Mathf.Abs(value))*collapseEdgeFactor;*/



        Vector3[] edgeVertices = GetEdge(info.cube, info.pickedFace, info.pickedEdge);
        edgeVertices[0] = edgeVertices[0] + (value * axis);
        edgeVertices[1] = edgeVertices[1] + (value * axis);

        float min = -0.5f;
        float max = 0.5f;

        if (IsOutOfBound(edgeVertices))
        {
            if (IsFaceBoxSideAligened(info.cube, info.pickedFace))
            {
                coob = CubeOutOfBoundState.OutOfBoundsAddEdge;
            }

            return;
        }

        MathFunctions.ClampVector(ref edgeVertices[0], min, max);
        MathFunctions.ClampVector(ref edgeVertices[1], min, max);

        MathFunctions.RoundVector(ref edgeVertices[0], 3);
        MathFunctions.RoundVector(ref edgeVertices[1], 3);

        Vector3[] corners = (Vector3[])info.cube.Corners.Clone();

        SetEdge(ref corners, info.pickedFace, info.pickedEdge, edgeVertices);



        if (IsLegal(corners))
        {
            SetEdge(info.cube, info.pickedFace, info.pickedEdge, edgeVertices);
            if(coob == CubeOutOfBoundState.NoChange)
            {
                coob = CubeOutOfBoundState.WithinBounds;
            }
        }
        /*if (IsCornersValid(corners))
        {
            SetEdge(info.cube, info.pickedFace, info.pickedEdge, edgeVertices);
        }*/


    }

    static bool FaceIsOutOfCubeBoundery(Vector3[] faceVertices)
    {

        float min = -0.5f;
        float max = 0.5f;

        for (int i = 0; i < faceVertices.Length; i++)
        {
            MathFunctions.RoundVector(ref faceVertices[i], 3);

            int valsWithinBounds = 0;

            for (int j = 0; j < 3; j++)
            {
                if (faceVertices[i][j] >= min && faceVertices[i][j] <= max)
                {
                    valsWithinBounds++;

                }
            }

            if (valsWithinBounds == 3)
            {
                return false;
            }
        }
        return true;

    }

    static void AddDeltaToFace(ref Vector3[] faceVertices, float delta, Vector3 axis)
    {
        for (int i = 0; i < faceVertices.Length; i++)
        {
            faceVertices[i] = faceVertices[i] + (delta * axis);
        }
    }

    static void ClampFace(ref Vector3[] faceVertices)
    {
        float min = -0.5f;
        float max = 0.5f;
        for (int i = 0; i < faceVertices.Length; i++)
        {
            MathFunctions.ClampVector(ref faceVertices[i], min, max);
            MathFunctions.RoundVector(ref faceVertices[i], 3);

        }
    }

    public static void MoveFace(CubePickingInfo info, float delta, Vector3 axis, ref CubeOutOfBoundState outOfBoundState)
    {

        Vector3[] faceVertices = GetFace(info.cube.Corners, info.pickedFace);

        AddDeltaToFace(ref faceVertices, delta, axis);

        bool isOutOfBounds = FaceIsOutOfCubeBoundery(faceVertices);

        ClampFace(ref faceVertices);



        Vector3[] corners = (Vector3[])info.cube.Corners.Clone();
        SetFace(ref corners, info.pickedFace, faceVertices);

        if (IsLegal(corners))
        {
            SetFace(info.cube, info.pickedFace, faceVertices);



        }

        if (isOutOfBounds)
        {
            if (IsCollapsed(info.cube.Corners))
            {
                outOfBoundState = CubeOutOfBoundState.OutOfBoundsRemove;
            }
            else
            {
                outOfBoundState = CubeOutOfBoundState.OutOfBoundsAdd;
            }
        }
        else
        {
            outOfBoundState = CubeOutOfBoundState.WithinBounds;
        }


    }
    static bool IsEdgeStraight(Vector3[] edge)
    {
        int foundCoords = 0;
        for (int i = 0; i < 3; i++)
        {
            if (edge[0][i] == edge[1][i])
            {
                foundCoords++;

                if (foundCoords == 2)
                {
                    return true;
                }
            }
        }
        return false;

    }
    static List<Vector3> GetCorners(Vector3[] counterClockwiseFace, Face direction)
    {
        float halfCubeHeight = 0.5f;
        Quaternion toTopRotation = GetToTopRotation(direction);


        for (int i = 0; i < counterClockwiseFace.Length; i++)
        {
            counterClockwiseFace[i] = (toTopRotation * counterClockwiseFace[i]);
            counterClockwiseFace[i] = new Vector3(counterClockwiseFace[i].x, 0.0f, counterClockwiseFace[i].z);


        }


        List<Vector3> topFaceCorners = new List<Vector3>
                               {
                                   new Vector3(counterClockwiseFace[0].x, halfCubeHeight, counterClockwiseFace[0].z),
                                   new Vector3(counterClockwiseFace[1].x, halfCubeHeight, counterClockwiseFace[1].z),
                                   new Vector3(counterClockwiseFace[2].x, halfCubeHeight, counterClockwiseFace[2].z),
                                   new Vector3(counterClockwiseFace[3].x, halfCubeHeight, counterClockwiseFace[3].z),
                                   new Vector3(counterClockwiseFace[3].x, -halfCubeHeight, counterClockwiseFace[3].z),
                                   new Vector3(counterClockwiseFace[2].x, -halfCubeHeight, counterClockwiseFace[2].z),
                                   new Vector3(counterClockwiseFace[1].x, -halfCubeHeight, counterClockwiseFace[1].z),
                                   new Vector3(counterClockwiseFace[0].x, -halfCubeHeight, counterClockwiseFace[0].z)
                               };
        List<Vector3> corners = CreateCubeCornersFromTopFace(topFaceCorners, direction);
        return corners;


    }



    static Vector3[] GetVertices(Vector3[] corners)
    {






        //Top
        //Bottom
        List<Vector3> vertices = new List<Vector3>(corners);
        //Front
        vertices.Add(vertices[7]);
        vertices.Add(vertices[6]);
        vertices.Add(vertices[1]);
        vertices.Add(vertices[0]);
        //Back
        vertices.Add(vertices[5]);
        vertices.Add(vertices[4]);
        vertices.Add(vertices[3]);
        vertices.Add(vertices[2]);
        //Left
        vertices.Add(vertices[4]);
        vertices.Add(vertices[7]);
        vertices.Add(vertices[0]);
        vertices.Add(vertices[3]);
        //Right
        vertices.Add(vertices[6]);
        vertices.Add(vertices[5]);
        vertices.Add(vertices[2]);
        vertices.Add(vertices[1]);
        return vertices.ToArray();
    }
    static void SetFace(ref Vector3[] corners, Face face, Vector3[] faceVertices)
    {
        switch (face)
        {

            case Face.Top:
                corners[0] = faceVertices[0];
                corners[1] = faceVertices[1];
                corners[2] = faceVertices[2];
                corners[3] = faceVertices[3];
                break;

            case Face.Bottom:
                corners[4] = faceVertices[0];
                corners[5] = faceVertices[1];
                corners[6] = faceVertices[2];
                corners[7] = faceVertices[3];
                break;
            case Face.Back:
                corners[5] = faceVertices[0];
                corners[4] = faceVertices[1];
                corners[3] = faceVertices[2];
                corners[2] = faceVertices[3];
                break;
            case Face.Front:
                corners[7] = faceVertices[0];
                corners[6] = faceVertices[1];
                corners[1] = faceVertices[2];
                corners[0] = faceVertices[3];
                break;
            case Face.Left:
                corners[4] = faceVertices[0];
                corners[7] = faceVertices[1];
                corners[0] = faceVertices[2];
                corners[3] = faceVertices[3];
                break;
            case Face.Right:
                corners[6] = faceVertices[0];
                corners[5] = faceVertices[1];
                corners[2] = faceVertices[2];
                corners[1] = faceVertices[3];
                break;
        }
    }



    static List<Vector3> SquareCornersToCubeCorners(List<Vector2> corners, Face direction)
    {
        float halfCubeHeight = 0.5f;
        Vector3 toCenter = new Vector3(-halfCubeHeight, -halfCubeHeight, -halfCubeHeight);
        List<Vector3> cubeCorners = new List<Vector3>
                               {
                                   new Vector3(corners[0].x, 1.0f, corners[0].y) + toCenter,
                                   new Vector3(corners[3].x, 1.0f, corners[3].y) + toCenter,
                                   new Vector3(corners[2].x, 1.0f, corners[2].y) + toCenter,
                                   new Vector3(corners[1].x, 1.0f, corners[1].y) + toCenter,
                                   new Vector3(corners[1].x, 0, corners[1].y) + toCenter,
                                   new Vector3(corners[2].x, 0, corners[2].y) + toCenter,
                                   new Vector3(corners[3].x, 0, corners[3].y) + toCenter,
                                   new Vector3(corners[0].x, 0, corners[0].y) + toCenter
                               };
        return CreateCubeCornersFromTopFace(cubeCorners, direction);
    }



    static List<Vector3> CreateCubeCornersFromTopFace(List<Vector3> cubeCorners, Face direction)
    {


        List<Vector3> rotatedCorners = new List<Vector3>(8);
        List<Vector3> rotatedCornersBookkeeping = new List<Vector3>(8);

        for (int i = 0; i < cubeCorners.Count; i++)
        {
            rotatedCorners.Add(cubeCorners[i]);
        }

        for (int i = 0; i < cubeCorners.Count; i++)
        {
            rotatedCornersBookkeeping.Add(cubeCorners[i]);
        }
        switch (direction)
        {
            case Face.Top:
                //Done
                break;
            case Face.Bottom:

                //Done
                rotatedCorners[7] = cubeCorners[3];
                rotatedCorners[6] = cubeCorners[2];
                rotatedCorners[4] = cubeCorners[0];
                rotatedCorners[5] = cubeCorners[1];
                rotatedCorners[3] = cubeCorners[7];
                rotatedCorners[2] = cubeCorners[6];
                rotatedCorners[0] = cubeCorners[4];
                rotatedCorners[1] = cubeCorners[5];
                cubeCorners = rotatedCorners;
                break;
            case Face.Back:
                //Done
                rotatedCornersBookkeeping[0] = cubeCorners[3];
                rotatedCornersBookkeeping[1] = cubeCorners[2];
                rotatedCornersBookkeeping[3] = cubeCorners[4];
                rotatedCornersBookkeeping[2] = cubeCorners[5];
                rotatedCornersBookkeeping[7] = cubeCorners[0];
                rotatedCornersBookkeeping[6] = cubeCorners[1];
                rotatedCornersBookkeeping[4] = cubeCorners[7];
                rotatedCornersBookkeeping[5] = cubeCorners[6];

                rotatedCorners[0] = rotatedCornersBookkeeping[2];
                rotatedCorners[1] = rotatedCornersBookkeeping[3];
                rotatedCorners[2] = rotatedCornersBookkeeping[0];
                rotatedCorners[3] = rotatedCornersBookkeeping[1];
                rotatedCorners[4] = rotatedCornersBookkeeping[6];
                rotatedCorners[5] = rotatedCornersBookkeeping[7];
                rotatedCorners[6] = rotatedCornersBookkeeping[4];
                rotatedCorners[7] = rotatedCornersBookkeeping[5];
                cubeCorners = rotatedCorners;
                break;

            case Face.Front:

                //Done
                rotatedCorners[0] = cubeCorners[3];
                rotatedCorners[1] = cubeCorners[2];
                rotatedCorners[3] = cubeCorners[4];
                rotatedCorners[2] = cubeCorners[5];
                rotatedCorners[7] = cubeCorners[0];
                rotatedCorners[6] = cubeCorners[1];
                rotatedCorners[4] = cubeCorners[7];
                rotatedCorners[5] = cubeCorners[6];
                cubeCorners = rotatedCorners;
                break;
            case Face.Left:
                //Done
                rotatedCornersBookkeeping[0] = cubeCorners[3];
                rotatedCornersBookkeeping[1] = cubeCorners[2];
                rotatedCornersBookkeeping[3] = cubeCorners[4];
                rotatedCornersBookkeeping[2] = cubeCorners[5];
                rotatedCornersBookkeeping[7] = cubeCorners[0];
                rotatedCornersBookkeeping[6] = cubeCorners[1];
                rotatedCornersBookkeeping[4] = cubeCorners[7];
                rotatedCornersBookkeeping[5] = cubeCorners[6];

                rotatedCorners[0] = rotatedCornersBookkeeping[1];
                rotatedCorners[1] = rotatedCornersBookkeeping[2];
                rotatedCorners[2] = rotatedCornersBookkeeping[3];
                rotatedCorners[3] = rotatedCornersBookkeeping[0];
                rotatedCorners[4] = rotatedCornersBookkeeping[7];
                rotatedCorners[5] = rotatedCornersBookkeeping[4];
                rotatedCorners[6] = rotatedCornersBookkeeping[5];
                rotatedCorners[7] = rotatedCornersBookkeeping[6];
                cubeCorners = rotatedCorners;
                break;
            case Face.Right:
                //Done
                rotatedCornersBookkeeping[0] = cubeCorners[3];
                rotatedCornersBookkeeping[1] = cubeCorners[2];
                rotatedCornersBookkeeping[3] = cubeCorners[4];
                rotatedCornersBookkeeping[2] = cubeCorners[5];
                rotatedCornersBookkeeping[7] = cubeCorners[0];
                rotatedCornersBookkeeping[6] = cubeCorners[1];
                rotatedCornersBookkeeping[4] = cubeCorners[7];
                rotatedCornersBookkeeping[5] = cubeCorners[6];

                rotatedCorners[0] = rotatedCornersBookkeeping[3];
                rotatedCorners[1] = rotatedCornersBookkeeping[0];
                rotatedCorners[2] = rotatedCornersBookkeeping[1];
                rotatedCorners[3] = rotatedCornersBookkeeping[2];
                rotatedCorners[4] = rotatedCornersBookkeeping[5];
                rotatedCorners[5] = rotatedCornersBookkeeping[6];
                rotatedCorners[6] = rotatedCornersBookkeeping[7];
                rotatedCorners[7] = rotatedCornersBookkeeping[4];
                cubeCorners = rotatedCorners;
                break;


        }


        Quaternion rotation = GetFromTopRotation(direction);
        for (int i = 0; i < cubeCorners.Count; i++)
        {
            Vector3 corner = (rotation * cubeCorners[i]);
            MathFunctions.RoundVector(ref corner, 3);
            cubeCorners[i] = corner;




        }

        return cubeCorners;

    }


    static Quaternion GetFromTopRotation(Face direction)
    {
        Quaternion rotation = Quaternion.identity;
        Quaternion yAxisRotation = Quaternion.identity;
        Quaternion zAxisRotation = Quaternion.identity;
        Quaternion xAxisRotation = Quaternion.identity;
        yAxisRotation.SetFromToRotation(Vector3.forward, Vector3.left);
        xAxisRotation.SetFromToRotation(Vector3.up, Vector3.back);
        zAxisRotation.SetFromToRotation(Vector3.up, Vector3.right);


        switch (direction)
        {

            case Face.Top:

                break;
            case Face.Bottom:
                rotation = xAxisRotation * xAxisRotation;
                break;
            case Face.Back:
                rotation = yAxisRotation * yAxisRotation * xAxisRotation;
                break;
            case Face.Front:
                rotation = xAxisRotation;
                break;
            case Face.Left:
                rotation = Quaternion.Inverse(yAxisRotation) * xAxisRotation;
                break;
            case Face.Right:
                rotation = yAxisRotation * xAxisRotation;
                break;


        }
        return rotation;

    }

    static Vector3[] RotateFaceToTop(Cube cube, Face direction)
    {
        cornersBookkeeping = cube.Corners;
        Vector3[] corners = new Vector3[] {cornersBookkeeping[0],
                                            cornersBookkeeping[1],
                                            cornersBookkeeping[2],
                                            cornersBookkeeping[3],
                                            cornersBookkeeping[4],
                                            cornersBookkeeping[5],
                                            cornersBookkeeping[6],
                                            cornersBookkeeping[7]};
        Quaternion toTopRotation = GetToTopRotation(direction);
        for (int i = 0; i < corners.Length; i++)
        {
            Vector3 corner = (toTopRotation * corners[i]);
            MathFunctions.RoundVector(ref corner, 3);
            corners[i] = corner;
        }
        return corners;
    }

    static Quaternion GetToTopRotation(Face direction)
    {
        Quaternion rotation = Quaternion.identity;
        Quaternion yAxisRotation = Quaternion.identity;
        Quaternion zAxisRotation = Quaternion.identity;
        Quaternion xAxisRotation = Quaternion.identity;
        yAxisRotation.SetFromToRotation(Vector3.forward, Vector3.left);
        xAxisRotation.SetFromToRotation(Vector3.up, Vector3.back);
        zAxisRotation.SetFromToRotation(Vector3.up, Vector3.right);


        switch (direction)
        {

            case Face.Top:

                break;
            case Face.Bottom:
                rotation = Quaternion.Inverse(xAxisRotation) * Quaternion.Inverse(xAxisRotation);
                break;
            case Face.Back:
                rotation = Quaternion.Inverse(xAxisRotation) * Quaternion.Inverse(yAxisRotation) * Quaternion.Inverse(yAxisRotation);
                break;
            case Face.Front:
                rotation = Quaternion.Inverse(xAxisRotation);
                break;
            case Face.Left:
                rotation = Quaternion.Inverse(xAxisRotation) * yAxisRotation;
                break;
            case Face.Right:
                rotation = Quaternion.Inverse(xAxisRotation) * Quaternion.Inverse(yAxisRotation);
                break;


        }
        return rotation;

    }





    static void SetEdge(ref Vector3[] corners, Face face, Edge edge, Vector3[] edgeVertices)
    {


        Vector3[] faceVertices = GetFace(corners, face);


        switch (edge)
        {
            case Edge.Front:
                faceVertices[0] = edgeVertices[0];
                faceVertices[1] = edgeVertices[1];
                break;
            case Edge.Back:
                faceVertices[2] = edgeVertices[0];
                faceVertices[3] = edgeVertices[1];
                break;
            case Edge.Left:
                faceVertices[3] = edgeVertices[0];
                faceVertices[0] = edgeVertices[1];
                break;
            case Edge.Right:
                faceVertices[1] = edgeVertices[0];
                faceVertices[2] = edgeVertices[1];
                break;
        }
        SetFace(ref corners, face, faceVertices);

    }

    static bool IsFaceCollapsed(Vector3[] faceIndices)
    {
        //Test3 face indices must be a minimum distance from eachother
        for (int i = 0; i < faceIndices.Length; i++)
        {
            if ((faceIndices[(i + 1) % faceIndices.Length] - faceIndices[i % faceIndices.Length]).magnitude < 0.001f)
            {
                return true;
            }
        }
        return false;
    }

    static bool IsFaceValid(Vector3[] faceIndices, Face face)
    {


        Vector3 normal = Vector3.Cross((faceIndices[1] - faceIndices[0]).normalized, (faceIndices[2] - faceIndices[1]).normalized).normalized;

        //Test1 is all vertices must be in face plane
        Plane plane = new Plane(normal, faceIndices[0]);

        for (int i = 1; i < faceIndices.Length; i++)
        {


            if (Mathf.Abs(plane.GetDistanceToPoint(faceIndices[i])) > 0.00001f)
            {
                // Debug.Log("face failed plane test");
                return false;
            }
        }

        //Test2 face normal must point out
        float dot = Vector3.Dot(GetFaceAxis(face), normal);

        if (dot > 0.0f)
        {
            return false;
        }

        /*if(IsFaceCollapsed(faceIndices))
        {
            return false;
        }*/

        return true;
    }

    public static bool IsCollapsed(Vector3[] corners)
    {
        Vector3[] planeVertices = new Vector3[3];
        if (GetPlaneVertices(corners, ref planeVertices))
        {


            Plane plane = new Plane(planeVertices[0], planeVertices[1], planeVertices[2]);


            foreach (Vector3 vector3 in corners)
            {

                if (Mathf.Abs(plane.GetDistanceToPoint(vector3)) > 0.01)
                {
                    return false;
                }
            }

        }



        return true;

    }

    public static bool GetPlaneVertices(Vector3[] corners, ref Vector3[] planeVertices)
    {
        HashSet<Vector3> uniqueCorners = new HashSet<Vector3>();
        for (int i = 0; i < corners.Length; i++)
        {
            uniqueCorners.Add(corners[i]);
        }

        if(uniqueCorners.Count< 3)
        {
            return false;
        }

        List<Vector3> uniqueCornersList = new List<Vector3>(uniqueCorners);

        List<Vector3> tempPlaneVertices = new List<Vector3>();

        tempPlaneVertices.Add(uniqueCornersList[0]);
        tempPlaneVertices.Add(uniqueCornersList[1]);


        Vector3 baseDir = (uniqueCornersList[1] - uniqueCornersList[0]).normalized; 

        for(int i = 2; i < uniqueCornersList.Count; i++)
        {
            float dot = Vector3.Dot(baseDir, (uniqueCornersList[i] - uniqueCornersList[0]).normalized);

            if (dot < 0.99f && dot> -0.99)
            {
                tempPlaneVertices.Add(uniqueCornersList[i]);
                planeVertices = tempPlaneVertices.ToArray();
                return true;
            }
        }
        return false;

    }


    public static bool IsLegal(Vector3[] corners)
    {
        foreach (Face face in Enum.GetValues(typeof(Face)))
        {
            Vector3[] localFaceIndices = GetFace(corners, face);

            Vector3 normal = Vector3.zero;

            for (int i = 0; i < localFaceIndices.Length; i++)
            {
                normal += Vector3.Cross(localFaceIndices[i % localFaceIndices.Length],
                              localFaceIndices[(i + 1) % localFaceIndices.Length]);
            }
            normal.Normalize();
            normal = -normal;

            Vector3 faceAxis = GetFaceAxis(face);

            float dot = Vector3.Dot(normal, faceAxis);



            /*Debug.Log(face);
            Debug.Log(normal);
            Debug.Log(faceAxis);
            Debug.Log(dot);*/
            if (dot < -0.0001)
            {
                return false;
            }
        }
        return true;
    }
    static bool IsCornersValid(Vector3[] corners)
    {
        for (int i = 0; i < 6; i++)
        {
            if (!IsFaceValid(GetFace(corners, (Face)i), (Face)i))
            {
                return false;
            }
        }

        return true;
    }


    static void GetTriangle(int triangleNr, Vector3[] triangleVertices, Vector3[] corners)
    {
        switch (triangleNr)
        {
            case 0:
                {
                    triangleVertices[0] = corners[0];
                    triangleVertices[1] = corners[1];
                    triangleVertices[2] = corners[2];
                    break;
                }
            case 1:
                {
                    triangleVertices[0] = corners[0];
                    triangleVertices[1] = corners[2];
                    triangleVertices[2] = corners[3];
                    break;
                }
            case 2:
                {
                    triangleVertices[0] = corners[4];
                    triangleVertices[1] = corners[5];
                    triangleVertices[2] = corners[6];
                    break;
                }
            case 3:
                {
                    triangleVertices[0] = corners[4];
                    triangleVertices[1] = corners[6];
                    triangleVertices[2] = corners[7];
                    break;
                }
            case 4:
                {
                    triangleVertices[0] = corners[0];
                    triangleVertices[1] = corners[1];
                    triangleVertices[2] = corners[2];
                    break;
                }
            case 5:
                {
                    triangleVertices[0] = corners[0];
                    triangleVertices[1] = corners[1];
                    triangleVertices[2] = corners[2];
                    break;
                }
            case 6:
                {
                    triangleVertices[0] = corners[0];
                    triangleVertices[1] = corners[1];
                    triangleVertices[2] = corners[2];
                    break;
                }
            case 7:
                {
                    triangleVertices[0] = corners[0];
                    triangleVertices[1] = corners[1];
                    triangleVertices[2] = corners[2];
                    break;
                }
            case 8:
                {
                    triangleVertices[0] = corners[0];
                    triangleVertices[1] = corners[1];
                    triangleVertices[2] = corners[2];
                    break;
                }
            case 9:
                {
                    triangleVertices[0] = corners[0];
                    triangleVertices[1] = corners[1];
                    triangleVertices[2] = corners[2];
                    break;
                }
            case 10:
                {
                    triangleVertices[0] = corners[0];
                    triangleVertices[1] = corners[1];
                    triangleVertices[2] = corners[2];
                    break;
                }
            case 11:
                {
                    triangleVertices[0] = corners[0];
                    triangleVertices[1] = corners[1];
                    triangleVertices[2] = corners[2];
                    break;
                }


        }
    }




}
