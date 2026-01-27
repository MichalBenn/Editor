using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using MV.WorldObject;
using UnityEngine;
using Object = UnityEngine.Object;
using MV.Common;
using Random = UnityEngine.Random;

public enum MeshSetting : int
{
    OriginalMesh = 0,
    Pow2,
    Pow4,
    MeshesLenght
}




class MeshData
{
    public List<Vector3> vertices = new List<Vector3>();
    public List<Vector2> uv = new List<Vector2>();
    public List<Color> colors = new List<Color>();
    public List<Material> materials = new List<Material>();
    public List<List<int>> subMeshTriangles = new List<List<int>>();

    public void SetToMesh(ref Mesh mesh, ref Material[] materials)
    {
        mesh.Clear();
        mesh.vertices = vertices.ToArray();
        mesh.colors = colors.ToArray();
        mesh.uv = uv.ToArray();
        mesh.subMeshCount = this.materials.Count;

        for (int mat = 0; mat < this.materials.Count; mat++)
        {

            mesh.SetTriangles(subMeshTriangles[mat].ToArray(), mat);
        }


        mesh.RecalculateNormals();
        mesh.RecalculateBounds();
        materials = this.materials.ToArray();

        vertices.Clear();
        uv.Clear();
        colors.Clear();
        this.materials.Clear();
        subMeshTriangles.Clear();
    }
}

public struct SharedMeshData
{
    public Mesh mesh;
    public Material[] materials;



    public SharedMeshData(Mesh mesh)
    {
        this.mesh = mesh;
        materials = new Material[0];
    }

    public void SetToMesh(ref Mesh mesh, ref Material[] materials)
    {
        mesh = this.mesh;
        materials = this.materials;
    }
}

public struct Cells
{
    public Cell[, ,] CellsArray { get { return cells; } }
    private Cell[, ,] cells;
    private IntVector chunkPosCubes;
    private IntVector chunkPos;
    private int chunkSize;
    private IntVector chunkOffset;

    public int ChunkSize
    {
        get { return chunkSize; }
    }

    public IntVector ChunkPos
    {
        get { return chunkPos; }
    }



    public Cells(IntVector iVector, int chunkSize)
    {
        chunkOffset = chunkSize / 2 * IntVector.One;
        this.chunkSize = chunkSize;
        chunkPos = iVector;
        chunkPosCubes = chunkSize * iVector;
        cells = new Cell[chunkSize, chunkSize, chunkSize];
    }

    public Cells Clone()
    {
        Cells clone = new Cells(chunkPos, chunkSize);
        Cell[, ,] clonedCells = new Cell[chunkSize, chunkSize, chunkSize];
        for (int i = 0; i < chunkSize; i++)
        {
            for (int j = 0; j < chunkSize; j++)
            {
                for (int k = 0; k < chunkSize; k++)
                {
                    clonedCells[i, j, k] = cells[i, j, k].Clone();
                }
            }
        }
        clone.cells = clonedCells;
        return clone;
    }

    public bool ContainsCube(IntVector worldPos)
    {
        if (this[GetArrayCoords(worldPos)].cube == null) return false;
        return true;
    }

    public void RemoveCube(IntVector worldPos)
    {
        Cell cell = new Cell();
        this[GetArrayCoords(worldPos)] = cell;
    }


    public void SetCube(IntVector worldPos, Cube cube)
    {
        Cell cell = new Cell(cube, 0);
        this[GetArrayCoords(worldPos)] = cell;

    }

    public Cell this[IntVector key]
    {
        get { return cells[key.x, key.y, key.z]; }
        set { cells[key.x, key.y, key.z] = value; }
    }

    public Cell this[int x, int y, int z]
    {
        get { return cells[x, y, z]; }
        set { cells[x, y, z] = value; }
    }

    public IntVector GetArrayCoords(IntVector worldPos)
    {
        return (worldPos - chunkPosCubes) + chunkOffset;
    }

    public IntVector GetWorldCoords(IntVector localPos)
    {
        return (localPos + chunkPosCubes) - chunkOffset;
    }

    public Cell GetCell(IntVector worldPos)
    {

        return this[GetArrayCoords(worldPos)];
    }

    public bool IsWithinArrayCoordsRange(IntVector localPos)
    {
        if (localPos.x >= 0 && localPos.x < chunkSize &&
            localPos.y >= 0 && localPos.y < chunkSize &&
            localPos.z >= 0 && localPos.z < chunkSize)
        {
            return true;
        }
        return false;
    }

}

public class CubeModelChunk
{
    static private int chunkSize = 32;
    static public int ChunkSize { get { return chunkSize; } }

    private IntVector chunkPos;
    List<GameObject> instances = new List<GameObject>();
    private SharedMeshData[] meshes = new SharedMeshData[(int)MeshSetting.MeshesLenght];
    private string name;
    private int cubeCount = 0;
    public int CubeCount { get { return cubeCount; } }
    private Cells cells;

    public CubeModelChunk(IntVector iVector)
    {
        name = "chunk" + iVector.x + "." + iVector.y + "." + iVector.z;
        chunkPos = iVector;
        cells = new Cells(chunkPos, ChunkSize);
        for (int i = 0; i < meshes.Length; i++)
        {
            meshes[i] = new SharedMeshData(new Mesh());
        }
    }


    public CubeModelChunk CloneGeometry(Vector3 scale)
    {
        CubeModelChunk clone = new CubeModelChunk(chunkPos);
        clone.cells = cells.Clone();
        clone.cubeCount = cubeCount;
        clone.RebuildChunk(scale);
        clone.RebuildMipMapMesh(scale);
        return clone;
    }

    public bool CompareGeometry(CubeModelChunk chunk)
    {
        for (int i = 0; i < chunkSize; i++)
        {
            for (int j = 0; j < chunkSize; j++)
            {
                for (int k = 0; k < chunkSize; k++)
                {
                    if ((chunk.cells[i, j, k].cube == null && cells[i, j, k].cube != null) || (chunk.cells[i, j, k].cube != null && cells[i, j, k].cube == null))
                        return false;
                    if ((chunk.cells[i, j, k].cube != cells[i, j, k].cube)) return false;
                }
            }
        }
        return true;
    }

    public Cube GetCube(IntVector iVector)
    {
        return cells.GetCell(iVector).cube;
    }

    public bool ContainsCube(IntVector iVector)
    {
        return !(cells.GetCell(iVector).cube == null);
    }

    public void AddToChunk(IntVector iVector, Cube cube, bool setVisibility = true)
    {
        if (!cells.ContainsCube(iVector)) cubeCount++;
        cells.SetCube(iVector, cube);
        if (setVisibility) SetCubeVisibilityWithNeighbors(cells.GetArrayCoords(iVector));
    }
    public IntVector GetFirstSolidCubePos()
    {
        for (int i = 0; i < ChunkSize; i++)
        {
            for (int j = 0; j < ChunkSize; j++)
            {
                for (int k = 0; k < ChunkSize; k++)
                {
                    IntVector worldPos = cells.GetWorldCoords(new IntVector((short)i, (short)j, (short)k));
                    if (cells.ContainsCube(worldPos)) return worldPos;
                }
            }
        }
        Debug.LogError("No cube found in chunk. This is a problem");
        return IntVector.One;
    }

    public void RemoveFromChunk(IntVector iVector)
    {
        if (!cells.ContainsCube(iVector)) return;
        cells.RemoveCube(iVector);
        SetCubeVisibilityWithNeighbors(cells.GetArrayCoords(iVector));
        cubeCount--;
    }

    public void Destroy()
    {
        foreach (GameObject instance in instances)
        {

            UnityEngine.GameObject.Destroy(instance);
        }

    }

    static void CalculateLights(Cells cells)
    {
        Cell[, ,] cellsArray = cells.CellsArray;
        byte lightValue = 0;
        for(int i = 0; i < cells.ChunkSize; i++)
        {
            for (int j = 0; j < cells.ChunkSize; j++)
            {
                for (int k = 0; k < cells.ChunkSize; k++)
                {
                    if (cellsArray[i, j, k].cube == null)
                    {
                        lightValue = 255;
                    }
                    
                    else
                    {
                        lightValue = 0;
                    }

                    Cell cell = cellsArray[i, j, k];
                    cell.lightValue = lightValue;
                    cellsArray[i, j, k] = cell;
                }
            }

        }
    }

    public void RebuildChunk(Vector3 scale)
    {

        CalculateLights(cells);
        MeshData meshData = new MeshData();
        DateTime start = DateTime.Now;
        RebuildMesh(ref meshData, cells, scale);
        Debug.Log("Rebuild mesh time " + (DateTime.Now - start));
        meshData.SetToMesh(ref meshes[(int) MeshSetting.OriginalMesh].mesh,
                           ref meshes[(int) MeshSetting.OriginalMesh].materials);

        UpdateInstances();
    }

    public void RebuildMipMapMesh(Vector3 scale)
    {
        MeshData meshData = new MeshData();
        if (meshes[(int)MeshSetting.Pow2].mesh == null)
        {
            meshes[(int)MeshSetting.Pow2].mesh = new Mesh();
        }

        if (meshes[(int)MeshSetting.Pow4].mesh == null)
        {
            meshes[(int)MeshSetting.Pow4].mesh = new Mesh();
        }

        int power = 2;
        Cells cellsMipMapPow2;
        if (GetMipMeshCells(cells, 2, out cellsMipMapPow2))
        {
            SetCubeVisibility(cellsMipMapPow2);
            RebuildMesh(ref meshData, cellsMipMapPow2, scale, power);
            meshData.SetToMesh(ref meshes[(int)MeshSetting.Pow2].mesh,
                   ref meshes[(int)MeshSetting.Pow2].materials);

        }
        Cells cellsMipMapPow4;
        if (GetMipMeshCells(cellsMipMapPow2, 2, out cellsMipMapPow4))
        {
            SetCubeVisibility(cellsMipMapPow4);
            RebuildMesh(ref meshData, cellsMipMapPow4, scale, 4);
            meshData.SetToMesh(ref meshes[(int)MeshSetting.Pow4].mesh,
                   ref meshes[(int)MeshSetting.Pow4].materials);
        }
    }

    public SharedMeshData GetMeshData(MeshSetting mipMesh)
    {
        return meshes[(int)mipMesh];
    }


    void UpdateInstances()
    {

        //Todo: sanity check delete procedure
        List<int> deleteList = new List<int>();

        for (int i = 0; i < instances.Count; i++)
        {
            if (instances[i] != null)
            {
                MeshRenderer instanceMeshRenderer = instances[i].GetComponent<MeshRenderer>();
                instanceMeshRenderer.sharedMaterials = meshes[(int)MeshSetting.OriginalMesh].materials;

                MVGameController.Instance.WOCM.UpdateWorldBounds(instanceMeshRenderer.bounds);
                //Debug.Log("updating instances " + instanceMeshRenderer.bounds.min);
            }
            else
            {
                deleteList.Add(i);
            }
        }

        foreach (int i in deleteList)
        {
            instances.RemoveAt(i);
        }


        foreach (GameObject instance in instances)
        {
            BoxCollider boxCollider = instance.GetComponent<BoxCollider>();
            if (boxCollider != null)
            {

                Bounds bounds = meshes[(int)MeshSetting.OriginalMesh].mesh.bounds;
                boxCollider.size = bounds.size; //* boxCastObject.transform.localScale.x;
                boxCollider.center = bounds.center; //* boxCastObject.transform.localScale.x;

            }
            else
            {
                instance.AddComponent<BoxCollider>();
            }

        }

    }

    public void SetInstanceDataRef(IntVector chunkPos, MVCubeModelBase cubeInstance)
    {
        GameObject instanceGameObject = new GameObject(name);

        MeshFilter meshFilter = instanceGameObject.AddComponent<MeshFilter>();
        MeshRenderer meshRenderer = instanceGameObject.AddComponent<MeshRenderer>();

        meshFilter.sharedMesh = meshes[(int)MeshSetting.OriginalMesh].mesh;
        meshRenderer.sharedMaterials = meshes[(int)MeshSetting.OriginalMesh].materials;
        BoxCollider boxCollider = instanceGameObject.GetComponent<BoxCollider>();
        if (boxCollider != null)
        {
            Bounds bounds = meshFilter.sharedMesh.bounds;
            boxCollider.size = bounds.size;
            boxCollider.center = bounds.center;
        }
        else
        {
            instanceGameObject.AddComponent<BoxCollider>();
        }



        instanceGameObject.transform.parent = cubeInstance.GameObject.transform;
        instanceGameObject.transform.localPosition = Vector3.zero;
        instanceGameObject.transform.localRotation = Quaternion.identity;
        instanceGameObject.transform.localScale = Vector3.one;

        instanceGameObject.layer = cubeInstance.GameObject.layer;
        instances.Add(instanceGameObject);

        cubeInstance.chunkInstances.Add(chunkPos, instanceGameObject);
    }

    //Cube visibility
    void SetCubeVisibilityWithNeighbors(IntVector pos)
    {
        IntVector curPos = new IntVector(pos.x, pos.y, pos.z);

        Cube centerCube = cells[pos].cube;
        if (centerCube != null)
        {
            //Debug.Log("setting visibility");
            Cube.SetCubeFlags(centerCube);
        }

        SetCubeVisibility(curPos);

        curPos.x += 1;
        SetCubeVisibility(curPos);
        curPos.x -= 2;
        SetCubeVisibility(curPos);
        curPos.x += 1;

        curPos.y += 1;
        SetCubeVisibility(curPos);
        curPos.y -= 2;
        SetCubeVisibility(curPos);
        curPos.y += 1;

        curPos.z += 1;
        SetCubeVisibility(curPos);
        curPos.z -= 2;
        SetCubeVisibility(curPos);
        curPos.z += 1;

    }


    void SetCubeVisibility(IntVector iVector)
    {
        if (!cells.IsWithinArrayCoordsRange(iVector)) return;
        Cube cube = cells[iVector].cube;
        if (cube != null)
        {
            cube.HiddenSides = 0;
            SetCubeVisibility(cells, iVector, cube);
        }

    }

    public void SetCubeVisibility()
    {
        SetCubeVisibility(cells);
    }
    static void SetCubeVisibility(Cells cells)
    {
        for (int i = 0; i < cells.ChunkSize; i++)
        {
            for (int j = 0; j < cells.ChunkSize; j++)
            {
                for (int k = 0; k < cells.ChunkSize; k++)
                {
                    SetCubeVisibility(cells, new IntVector((short)i, (short)j, (short)k), cells[i, j, k].cube);
                }
            }
        }
    }

    static void SetCubeVisibility(Cells cells, IntVector pos, Cube cube)
    {
        if (cube == null) return;
        IntVector testPos = new IntVector(pos.x, pos.y, pos.z);
        Cube bookKeepingCube;
        testPos.y += 1;

        if (cells.IsWithinArrayCoordsRange(testPos))
        {
            bookKeepingCube = cells[testPos].cube;
            SimpleFaceVisibilityTest(FaceFlags.Top, FaceFlags.Bottom, ref cube, ref bookKeepingCube);
        }

        testPos.y -= 2;

        if (cells.IsWithinArrayCoordsRange(testPos))
        {
            bookKeepingCube = cells[testPos].cube;
            SimpleFaceVisibilityTest(FaceFlags.Bottom, FaceFlags.Top, ref cube, ref bookKeepingCube);
        }

        testPos.y += 1;


        testPos.z += 1;

        if (cells.IsWithinArrayCoordsRange(testPos))
        {
            bookKeepingCube = cells[testPos].cube;
            SimpleFaceVisibilityTest(FaceFlags.Back, FaceFlags.Front, ref cube, ref bookKeepingCube);
        }

        testPos.z -= 2;

        if (cells.IsWithinArrayCoordsRange(testPos))
        {
            bookKeepingCube = cells[testPos].cube;
            SimpleFaceVisibilityTest(FaceFlags.Front, FaceFlags.Back, ref cube, ref bookKeepingCube);
        }

        testPos.z += 1;
        testPos.x += 1;
        if (cells.IsWithinArrayCoordsRange(testPos))
        {
            bookKeepingCube = cells[testPos].cube;
            SimpleFaceVisibilityTest(FaceFlags.Right, FaceFlags.Left, ref cube, ref bookKeepingCube);
        }

        testPos.x -= 2;

        if (cells.IsWithinArrayCoordsRange(testPos))
        {
            bookKeepingCube = cells[testPos].cube;
            SimpleFaceVisibilityTest(FaceFlags.Left, FaceFlags.Right, ref cube, ref bookKeepingCube);
        }
        testPos.x += 1;
    }


    static void SimpleFaceVisibilityTest(FaceFlags faceFlagCube, FaceFlags faceFlagOpposite, ref Cube cube, ref Cube neighborCube)
    {
        if (neighborCube == null || (cube.HiddenSides & (byte)faceFlagCube) != 0) return;
        if ((cube.UnIndentedSides & (byte)faceFlagCube) != 0 && (neighborCube.UnIndentedSides & (byte)faceFlagOpposite) != 0)
        {
            cube.HiddenSides |= (byte)faceFlagCube;
            neighborCube.HiddenSides |= (byte)faceFlagOpposite;
        }
        else
        {
            AdvancedFaceVisibilityTest(faceFlagCube, faceFlagOpposite, ref cube, ref neighborCube);
        }
    }

    static bool AllFaceCornersIsTouchingCubeBorder(Face face, ref Vector3[] faceIndices)
    {
        int targetAxis = -1;
        float value = 0.5f;

        switch (face)
        {

            case Face.Top:
                targetAxis = 1;
                value = 0.5f;
                break;
            case Face.Bottom:
                targetAxis = 1;
                value = -0.5f;
                break;

            case Face.Front:
                targetAxis = 2;
                value = -0.5f;
                break;
            case Face.Back:
                targetAxis = 2;
                value = 0.5f;
                break;

            case Face.Left:
                targetAxis = 0;
                value = -0.5f;
                break;
            case Face.Right:
                targetAxis = 0;
                value = 0.5f;
                break;
        }

        foreach (Vector3 faceIndex in faceIndices)
        {
            if (faceIndex[targetAxis] != value) return false;
        }

        return true;
    }


    static void AdvancedFaceVisibilityTest(FaceFlags faceFlagCube, FaceFlags faceFlagOpposite, ref Cube cube, ref Cube neighborCube)
    {

        Face face = Cube.FaceFlagToFace(faceFlagCube);

        Vector3[] targetFaceIndices = Cube.GetFace(cube.Corners, face);

        if (AllFaceCornersIsTouchingCubeBorder(face, ref targetFaceIndices))
        {
            Face faceOpposite = Cube.FaceFlagToFace(faceFlagOpposite);
            Vector3[] oppositeFaceIndices = Cube.GetFace(neighborCube.Corners, faceOpposite);
            if (AllFaceCornersIsTouchingCubeBorder(faceOpposite, ref oppositeFaceIndices))
            {
                //Debug.Log("advancedTest");


                switch (face)
                {
                    case Face.Top:
                    case Face.Bottom:



                        for (int i = 0; i < 4; i++)
                        {

                            if (targetFaceIndices[i].x != oppositeFaceIndices[3 - i].x || targetFaceIndices[i].z != oppositeFaceIndices[3 - i].z)
                            {
                                return;
                            }
                        }
                        cube.HiddenSides |= (byte)faceFlagCube;
                        neighborCube.HiddenSides |= (byte)faceFlagOpposite;
                        break;
                    case Face.Left:
                    case Face.Right:
                        if (targetFaceIndices[0].z != oppositeFaceIndices[1].z || targetFaceIndices[0].y != oppositeFaceIndices[1].y ||
                            targetFaceIndices[1].z != oppositeFaceIndices[0].z || targetFaceIndices[1].y != oppositeFaceIndices[0].y ||
                            targetFaceIndices[2].z != oppositeFaceIndices[3].z || targetFaceIndices[2].y != oppositeFaceIndices[3].y ||
                            targetFaceIndices[3].z != oppositeFaceIndices[2].z || targetFaceIndices[3].y != oppositeFaceIndices[2].y)
                            return;

                        cube.HiddenSides |= (byte)faceFlagCube;
                        neighborCube.HiddenSides |= (byte)faceFlagOpposite;
                        break;
                    case Face.Front:
                    case Face.Back:
                        if (targetFaceIndices[0].x != oppositeFaceIndices[1].x || targetFaceIndices[0].y != oppositeFaceIndices[1].y ||
                            targetFaceIndices[1].x != oppositeFaceIndices[0].x || targetFaceIndices[1].y != oppositeFaceIndices[0].y ||
                            targetFaceIndices[2].x != oppositeFaceIndices[3].x || targetFaceIndices[2].y != oppositeFaceIndices[3].y ||
                            targetFaceIndices[3].x != oppositeFaceIndices[2].x || targetFaceIndices[3].y != oppositeFaceIndices[2].y)
                            return;
                        cube.HiddenSides |= (byte)faceFlagCube;
                        neighborCube.HiddenSides |= (byte)faceFlagOpposite;
                        break;

                }
            }
        }




    }

    static Color redTransparent = new Color(0.7f, 0.7f, 0.7f);
    static Color blueTransparent = new Color(1.0f, 1.0f, 1.0f);

    private static List<Color> faceFacingColors = new List<Color>() { new Color(0.0f, 0.0f, 0.0f), 
        new Color(0.2f, 0.2f, 0.2f), 
        new Color(0.4f, 0.4f, 0.4f),
    new Color(0.6f, 0.6f, 0.6f),
    new Color(0.8f, 0.8f, 0.8f),
    new Color(1.0f, 1.0f, 1.0f)};


    int[] visibleFaces = new int[6];

    public class FaceData
    {
        public Vector3[] faceVertices = new Vector3[4];
        public Color[] colors = new Color[4];
        public Face face;




    }

    static private FaceData[] faceData = new FaceData[]
                                      {
                                          new FaceData(), 
                                          new FaceData(), 
                                          new FaceData(), 
                                          new FaceData(), 
                                          new FaceData(), 
                                          new FaceData(), 
                                      };

    //Mesh generation
    static void RebuildMesh(ref MeshData meshData, Cells cells, Vector3 scale, int power = 1)
    {
        meshData.vertices = new List<Vector3>();
        meshData.uv = new List<Vector2>();

        meshData.colors = new List<Color>();

        int faceCounter = 0;
        meshData.materials = new List<Material>();
        
        Dictionary<int, int> matMap = new Dictionary<int, int>();
        
        for (int i = 0; i < cells.ChunkSize; i++)
        {
            for (int j = 0; j < cells.ChunkSize; j++)
            {
                for (int k = 0; k < cells.ChunkSize; k++)
                {

                    if (cells[i, j, k].cube == null || cells[i, j, k].cube.HiddenSides == 0x3F) continue;
                    IntVector localPos = new IntVector((short) i, (short) j, (short) k);
                    IntVector worldPos = cells.GetWorldCoords(localPos);
                    int index = 0;
                    Cube.GetVisibleFaceVertices(cells[i, j, k].cube, ref faceData, worldPos, localPos, cells, ref index);

                    if (power != 1)
                    {
                        for (int faceIndex = 0; faceIndex < index; faceIndex++ )
                        {
                            for (int l = 0; l < faceData[faceIndex].faceVertices.Length; l++)
                            {
                                faceData[faceIndex].faceVertices[l] *= power;
                            }
                        }
                    }
                    
                    for(int faceIndex = 0; faceIndex < index; faceIndex++)
                    {
                        //meshData.vertices.AddRange(faceData[faceIndex].faceVertices);

                        for (int faceVertex = 0; faceVertex < 4; faceVertex++ )
                        {
                            meshData.vertices.Add(faceData[faceIndex].faceVertices[faceVertex]);
                            meshData.colors.Add(faceData[faceIndex].colors[faceVertex]);
                        }

                            /*foreach (Vector3 vector3 in faceData[faceIndex].faceVertices)
                            {
                                meshData.colors.Add(faceFacingColors[(int)faceData[faceIndex].face]);
                            }*/

                        meshData.uv.AddRange(GetFaceUvs(faceData[faceIndex].faceVertices, faceData[faceIndex].face, scale));
                        byte mat = Cube.GetMaterial(cells[i, j, k].cube, faceData[faceIndex].face);

                        Material material = MVGameController.Instance.WOCM.MaterialRepository.GetMaterial(mat).material;

                        if (!matMap.ContainsKey(mat))
                        {
                            meshData.materials.Add(material);
                            meshData.subMeshTriangles.Add(new List<int>());
                            matMap.Add(mat, meshData.materials.Count - 1);
                        }


                        int matIndex = matMap[mat];
                        meshData.subMeshTriangles[matIndex].Add((faceCounter * 4) + 0);
                        meshData.subMeshTriangles[matIndex].Add((faceCounter * 4) + 3);
                        meshData.subMeshTriangles[matIndex].Add((faceCounter * 4) + 2);

                        meshData.subMeshTriangles[matIndex].Add((faceCounter * 4) + 2);
                        meshData.subMeshTriangles[matIndex].Add((faceCounter * 4) + 1);
                        meshData.subMeshTriangles[matIndex].Add((faceCounter * 4) + 0);

                        faceCounter++;
                    }


                }
            }
        }





    }


    private static Vector2[] uvs = new Vector2[4];

    private static Vector2 uvOffsetVector = new Vector2(0.0f, 0.0f);

    private static Vector2 uvOffsetVector0 = Vector2.one * 0.5f;
    private static Vector2 uvOffsetVector1 = new Vector2(-0.5f, 0.5f);
    private static float bookKeepingFloat = 0.0f;
    private static Vector2 cubePosOffset = new Vector2(0.0f, 0.0f);

    static Vector2[] GetFaceUvs(Vector3[] faceVertices, Face face, Vector3 scale)
    {

        bookKeepingFloat = 0.0f;

        if (scale.x != scale.y || scale.x != scale.z)
        {
            Debug.LogError("algorithm does not support non uniform scale");
        }

        uvOffsetVector = uvOffsetVector0;


        switch (face)
        {
            case Face.Top:
                //Debug.Log("top");

                MathFunctions.Vector3ToVector2(ref faceVertices[0], ref uvs[0], 1);
                MathFunctions.Vector3ToVector2(ref faceVertices[1], ref uvs[1], 1);
                MathFunctions.Vector3ToVector2(ref faceVertices[2], ref uvs[2], 1);
                MathFunctions.Vector3ToVector2(ref faceVertices[3], ref uvs[3], 1);
                break;
            case Face.Bottom:
                //Debug.Log("bottom");
                MathFunctions.Vector3ToVector2(ref faceVertices[0], ref uvs[0], 1);
                MathFunctions.Vector3ToVector2(ref faceVertices[1], ref uvs[1], 1);
                MathFunctions.Vector3ToVector2(ref faceVertices[2], ref uvs[2], 1);
                MathFunctions.Vector3ToVector2(ref faceVertices[3], ref uvs[3], 1);
                for (int i = 0; i < 4; i++)
                {
                    uvs[i].x = -uvs[i].x;
                }
                uvOffsetVector = uvOffsetVector1;
                break;
            case Face.Back:
                MathFunctions.Vector3ToVector2(ref faceVertices[0], ref uvs[0], 2);
                MathFunctions.Vector3ToVector2(ref faceVertices[1], ref uvs[1], 2);
                MathFunctions.Vector3ToVector2(ref faceVertices[2], ref uvs[2], 2);
                MathFunctions.Vector3ToVector2(ref faceVertices[3], ref uvs[3], 2);
                //Debug.Log("back");
                for (int i = 0; i < 4; i++)
                {
                    uvs[i].x = -uvs[i].x;
                }
                uvOffsetVector = uvOffsetVector1;
                break;

            case Face.Front:
                MathFunctions.Vector3ToVector2(ref faceVertices[0], ref uvs[0], 2);
                MathFunctions.Vector3ToVector2(ref faceVertices[1], ref uvs[1], 2);
                MathFunctions.Vector3ToVector2(ref faceVertices[2], ref uvs[2], 2);
                MathFunctions.Vector3ToVector2(ref faceVertices[3], ref uvs[3], 2);

                //Debug.Log("front");
                break;

            case Face.Left:
                MathFunctions.Vector3ToVector2(ref faceVertices[0], ref uvs[0], 0);
                MathFunctions.Vector3ToVector2(ref faceVertices[1], ref uvs[1], 0);
                MathFunctions.Vector3ToVector2(ref faceVertices[2], ref uvs[2], 0);
                MathFunctions.Vector3ToVector2(ref faceVertices[3], ref uvs[3], 0);
                //Debug.Log("left");
                for (int i = 0; i < 4; i++)
                {
                    bookKeepingFloat = uvs[i].x;
                    uvs[i].x = uvs[i].y;
                    uvs[i].y = bookKeepingFloat;

                    uvs[i].x = -uvs[i].x;
                }
                uvOffsetVector = uvOffsetVector1;
                break;

            case Face.Right:
                MathFunctions.Vector3ToVector2(ref faceVertices[0], ref uvs[0], 0);
                MathFunctions.Vector3ToVector2(ref faceVertices[1], ref uvs[1], 0);
                MathFunctions.Vector3ToVector2(ref faceVertices[2], ref uvs[2], 0);
                MathFunctions.Vector3ToVector2(ref faceVertices[3], ref uvs[3], 0);
                //Debug.Log("right");
                for (int i = 0; i < 4; i++)
                {
                    bookKeepingFloat = uvs[i].x;
                    uvs[i].x = uvs[i].y;
                    uvs[i].y = bookKeepingFloat;


                }



                break;

        }

        //Debug.Log(uvs[0]);
        float divVal = (2.0f / scale[0]);
        
        for (int i = 0; i < 4; i++)
        {
            uvs[i] += uvOffsetVector;
            uvs[i] /= divVal;
            //uvs[i] += cubePosOffset;
        }


        return uvs;
    }

    internal struct MipMeshBookkeeping
    {
        private List<Cube> cubes;

        public int CubesCount { get { return cubes.Count; } }

        public MipMeshBookkeeping(List<Cube> cubes)
        {
            this.cubes = cubes;
        }

        public void AddCube(Cube cube)
        {

            cubes.Add(cube);
        }

        public int GetDominantCubeMaterial(Dictionary<int, int> materialCounts)
        {

            materialCounts.Clear();

            foreach (Cube cube in cubes)
            {
                int material = Cube.GetMaterial(cube, 0);

                if (!materialCounts.ContainsKey(material))
                {
                    materialCounts.Add(material, 0);

                }
                materialCounts[material] = materialCounts[material] + 1;

            }


            int dominantCubeMaterial = -1;

            int cubeCount = 0;

            foreach (KeyValuePair<int, int> materialCount in materialCounts)
            {
                if (materialCount.Value > cubeCount)
                {
                    dominantCubeMaterial = materialCount.Key;
                    cubeCount = materialCount.Value;
                }

            }
            return dominantCubeMaterial;
        }

    }

    private static Dictionary<int, int> materialCounts = new Dictionary<int, int>();
    private static Dictionary<IntVector, MipMeshBookkeeping> mipMeshBookkeeping = new Dictionary<IntVector, MipMeshBookkeeping>();

    private static IntVector intVectorBookkeeping = new IntVector();

    static bool GetMipMeshCells(Cells cells, int gridPower, out Cells cellsMipmap)
    {
        cellsMipmap = new Cells(cells.ChunkPos, cells.ChunkSize / gridPower);
        if (!Mathf.IsPowerOfTwo(gridPower))
        {
            Debug.LogError("gridPower must be power of 2!");
            return false;
        }
        mipMeshBookkeeping.Clear();

        int minCubesInCell = (gridPower * gridPower * gridPower) / 3;

        for (int i = 0; i < cells.ChunkSize; i++)
        {
            for (int j = 0; j < cells.ChunkSize; j++)
            {
                for (int k = 0; k < cells.ChunkSize; k++)
                {
                    intVectorBookkeeping.x = (short)i;
                    intVectorBookkeeping.y = (short)j;
                    intVectorBookkeeping.z = (short)k;

                    if (cells[i, j, k].cube == null) continue;

                    intVectorBookkeeping /= gridPower;

                    if (!mipMeshBookkeeping.ContainsKey(intVectorBookkeeping))
                    {
                        mipMeshBookkeeping.Add(intVectorBookkeeping, new MipMeshBookkeeping(new List<Cube>()));
                    }
                    mipMeshBookkeeping[intVectorBookkeeping].AddCube(cells[i, j, k].cube);

                }
            }
        }
        //Debug.Log("##################");
        foreach (KeyValuePair<IntVector, MipMeshBookkeeping> meshBookkeeping in mipMeshBookkeeping)
        {
            if (meshBookkeeping.Value.CubesCount >= minCubesInCell)
            {
                cellsMipmap[meshBookkeeping.Key] =
                    new Cell(
                        new Cube(Cube.IdentityByteCorners,
                                 Cube.CreateMaterialArray(
                                     (byte)meshBookkeeping.Value.GetDominantCubeMaterial(materialCounts))), 0);


                //Debug.Log("dominant material " + meshBookkeeping.Key+ " " + MVGameController.Instance.WOCM.MaterialRepository.GetMaterial((byte)meshBookkeeping.Value.GetDominantCubeMaterial(materialCounts)).material.name);

            }

        }

        return true;

    }


}

